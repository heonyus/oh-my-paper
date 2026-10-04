import type { ParsedDocumentPage } from "../../shared/documentPageModel"
import { AI_CONTEXT_MAX_CHARACTERS } from "../../shared/ipc"
import type { DocumentId } from "../../shared/schemas"
import { pageTextsFromAst } from "./documentAstProjection"
import { activeDocumentAst } from "./documentAstRuntime"
import { activeParsedDocumentPages, loadParsedDocumentPage } from "./documentPageRuntime"

const RETRIEVAL_CHUNK_SIZE = 900
const RETRIEVAL_CHUNK_STEP = 720
const RETRIEVAL_RESULT_LIMIT = 5
const MAX_QUESTION_QUERY_PARTS = 24

type PdfRetrievalChunk = {
  readonly id: string
  readonly page: number
  readonly text: string
  readonly normalized: string
  readonly tokens: readonly string[]
  readonly tokenCounts: ReadonlyMap<string, number>
  readonly grams: ReadonlySet<string>
}

function parsedPageRetrievalText(page: ParsedDocumentPage): string {
  return [...page.blocks]
    .sort((left, right) => left.order - right.order)
    .filter(
      (block) =>
        block.content.trim() &&
        block.label !== "image" &&
        block.label !== "header" &&
        block.label !== "footer" &&
        block.label !== "page_number",
    )
    .map((block) => block.content.trim())
    .join("\n\n")
}

export function pageTextsWithParsedPages(
  ast: NonNullable<ReturnType<typeof activeDocumentAst>>,
): readonly string[] {
  const pageTexts = [...pageTextsFromAst(ast)]
  for (const page of activeParsedDocumentPages()) {
    if (page.sourceHash !== ast.sourceHash) continue
    const parsedText = parsedPageRetrievalText(page)
    if (!parsedText) continue
    const nativeText = pageTexts[page.pageNumber - 1]?.trim() ?? ""
    pageTexts[page.pageNumber - 1] = nativeText ? `${nativeText}\n\n${parsedText}` : parsedText
  }
  return pageTexts
}

export type PdfRetrievalIndex = {
  readonly chunks: readonly PdfRetrievalChunk[]
  readonly documentFrequency: ReadonlyMap<string, number>
}

export type PdfRetrievalResult = {
  readonly id: string
  readonly rank: number
  readonly page: number
  readonly relevance: number
  readonly snippet: string
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/gu, " ").trim()
}

function retrievalTokens(value: string): readonly string[] {
  return normalizedText(value).match(/[\p{L}\p{N}]{2,}/gu) ?? []
}

function trigrams(value: string): ReadonlySet<string> {
  const compact = normalizedText(value).replace(/\s+/gu, "")
  const grams = new Set<string>()
  for (let index = 0; index <= compact.length - 3; index += 1) {
    grams.add(compact.slice(index, index + 3))
  }
  return grams
}

function overlapRatio(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let overlap = 0
  for (const value of left) if (right.has(value)) overlap += 1
  return overlap / Math.max(left.size, right.size)
}

function passageSnippet(text: string, queryTokens: readonly string[]): string {
  const displayText = text.replace(/\s+/gu, " ").trim()
  const normalized = displayText.toLocaleLowerCase()
  const firstMatch = queryTokens
    .map((token) => normalized.indexOf(token))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  const center = firstMatch ?? 0
  const rawStart = Math.max(0, center - 120)
  const nextBoundary = rawStart > 0 ? displayText.indexOf(" ", rawStart) : rawStart
  const start =
    rawStart > 0 && nextBoundary >= 0 && nextBoundary < center ? nextBoundary + 1 : rawStart
  const rawEnd = Math.min(displayText.length, start + 360)
  const previousBoundary =
    rawEnd < displayText.length ? displayText.lastIndexOf(" ", rawEnd) : rawEnd
  const end = previousBoundary > start ? previousBoundary : rawEnd
  return `${start > 0 ? "…" : ""}${displayText.slice(start, end)}${end < displayText.length ? " …" : ""}`
}

export function buildPdfRetrievalIndex(pageTexts: readonly string[]): PdfRetrievalIndex {
  const chunks = pageTexts.flatMap((pageText, pageIndex) => {
    const text = pageText.replace(/\s+/gu, " ").trim()
    if (!text) return []
    const count = Math.max(
      1,
      Math.ceil(Math.max(0, text.length - RETRIEVAL_CHUNK_SIZE) / RETRIEVAL_CHUNK_STEP) + 1,
    )
    return Array.from({ length: count }, (_, chunkIndex) => {
      const start = chunkIndex * RETRIEVAL_CHUNK_STEP
      const chunkText = text.slice(start, start + RETRIEVAL_CHUNK_SIZE).trim()
      const tokens = retrievalTokens(chunkText)
      const tokenCounts = new Map<string, number>()
      for (const token of tokens) tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1)
      return {
        id: `${pageIndex + 1}:${chunkIndex}`,
        page: pageIndex + 1,
        text: chunkText,
        normalized: normalizedText(chunkText),
        tokens,
        tokenCounts,
        grams: trigrams(chunkText),
      }
    })
  })
  const documentFrequency = new Map<string, number>()
  for (const chunk of chunks) {
    for (const token of new Set(chunk.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }
  return { chunks, documentFrequency }
}

export function rankPdfPassages(
  index: PdfRetrievalIndex,
  query: string,
): readonly PdfRetrievalResult[] {
  const normalizedQuery = normalizedText(query)
  const queryTokens = retrievalTokens(query)
  if (!normalizedQuery || queryTokens.length === 0) return []
  const queryGrams = trigrams(query)
  const scored = index.chunks.flatMap((chunk) => {
    const tokenCounts = chunk.tokenCounts
    const matchedTokens = queryTokens.filter((token) => tokenCounts.has(token))
    const coverage = matchedTokens.length / queryTokens.length
    const lexical = matchedTokens.reduce((score, token) => {
      const frequency = tokenCounts.get(token) ?? 0
      const documents = index.documentFrequency.get(token) ?? 0
      const inverseFrequency = Math.log((index.chunks.length + 1) / (documents + 1)) + 1
      return score + (1 + Math.log(frequency)) * inverseFrequency
    }, 0)
    const phrase = chunk.normalized.includes(normalizedQuery) ? 12 : 0
    const characterSimilarity = overlapRatio(queryGrams, chunk.grams)
    if (phrase === 0 && coverage < 0.34 && characterSimilarity < 0.1) return []
    return [
      {
        chunk,
        score: phrase + lexical * 2 + coverage * 4 + characterSimilarity * 3,
      },
    ]
  })
  const ordered = scored
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.chunk.page - right.chunk.page ||
        left.chunk.id.localeCompare(right.chunk.id),
    )
    .slice(0, RETRIEVAL_RESULT_LIMIT)
  const topScore = ordered[0]?.score ?? 1
  return ordered.map(({ chunk, score }, resultIndex) => ({
    id: chunk.id,
    rank: resultIndex + 1,
    page: chunk.page,
    relevance: Math.round((score / topScore) * 100),
    snippet: passageSnippet(chunk.text, queryTokens),
  }))
}

export function findPdfTextPage(query: string): number | null {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return null
  const ast = activeDocumentAst()
  if (ast) {
    const pageIndex = pageTextsWithParsedPages(ast).findIndex((text) =>
      text.toLocaleLowerCase().includes(needle),
    )
    if (pageIndex >= 0) return pageIndex + 1
  }
  for (const span of document.querySelectorAll<HTMLElement>(".textLayer span")) {
    if (!span.textContent?.toLocaleLowerCase().includes(needle)) continue
    const page = Number(span.closest<HTMLElement>(".page")?.getAttribute("data-page-number"))
    if (Number.isInteger(page) && page > 0) return page
  }
  return null
}

function questionQueryParts(question: string): readonly string[] {
  const parts = question
    .split(/\?|,|;|\band\b|\band\s+also\b|및|그리고/iu)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
  const tokens = retrievalTokens(question)
  const focused = tokens.flatMap((token, index) => {
    const next = tokens[index + 1]
    const single = /[A-Za-z]/u.test(token) && token.length >= 4 ? [token] : []
    const pair = next && token.length >= 3 && next.length >= 3 ? [`${token} ${next}`] : []
    return [...single, ...pair]
  })
  // Each part is a full pass over the index, so a question carrying a long passage of context
  // would otherwise rank hundreds of parts and hold the page for tens of seconds.
  return [...new Set([question.trim(), ...parts, ...focused])]
    .filter((part) => part.length >= 3)
    .slice(0, MAX_QUESTION_QUERY_PARTS)
}

function contextSnippetForResult(index: PdfRetrievalIndex, result: PdfRetrievalResult): string {
  const chunkIndex = index.chunks.findIndex((chunk) => chunk.id === result.id)
  const current = index.chunks[chunkIndex]
  const sourceText = current?.text ?? result.snippet
  const previous = chunkIndex > 0 ? index.chunks[chunkIndex - 1] : undefined
  if (!previous) return `Page ${result.page}: ${sourceText}`
  const preceding = previous.text.replace(/\s+/gu, " ").trim().slice(-280)
  return `Page ${previous.page} preceding context: ${preceding}\nPage ${result.page}: ${sourceText}`
}

function rankedResultsForQuestion(
  index: PdfRetrievalIndex,
  question: string,
): readonly PdfRetrievalResult[] {
  const rankedQueries = questionQueryParts(question).map((query) => rankPdfPassages(index, query))
  const matches: PdfRetrievalResult[] = []
  const seen = new Set<string>()
  for (let resultIndex = 0; resultIndex < RETRIEVAL_RESULT_LIMIT; resultIndex += 1) {
    for (const results of rankedQueries) {
      const result = results[resultIndex]
      if (!result || seen.has(result.id)) continue
      seen.add(result.id)
      matches.push(result)
      if (matches.length >= 8) return matches
    }
  }
  return matches
}

function sectionMembershipContext(question: string): string {
  const queryTokens = new Set(retrievalTokens(question))
  if (queryTokens.size === 0) return ""
  const blocks = activeParsedDocumentPages().flatMap((page) =>
    [...page.blocks]
      .sort((left, right) => left.order - right.order)
      .map((block) => ({ page: page.pageNumber, block })),
  )
  let precedingHeading: string | null = null
  const passages: {
    readonly page: number
    readonly content: string
    readonly precedingHeading: string
    readonly followingHeading: string | null
    readonly score: number
  }[] = []
  for (const [index, entry] of blocks.entries()) {
    const heading =
      entry.block.label === "doc_title" || entry.block.label === "paragraph_title"
        ? entry.block.content.replace(/^#+\s*/u, "").trim()
        : null
    if (heading) {
      precedingHeading = heading
      continue
    }
    if (!precedingHeading || !["text", "list", "equation"].includes(entry.block.label)) continue
    const contentTokens = new Set(retrievalTokens(entry.block.content))
    const score = [...queryTokens].filter((token) => contentTokens.has(token)).length
    if (score < 2) continue
    const followingHeading = blocks
      .slice(index + 1)
      .find(({ block }) => ["doc_title", "paragraph_title"].includes(block.label))?.block.content
    passages.push({
      page: entry.page,
      content: entry.block.content,
      precedingHeading,
      followingHeading: followingHeading?.replace(/^#+\s*/u, "").trim() ?? null,
      score,
    })
  }
  return passages
    .sort((left, right) => right.score - left.score || left.page - right.page)
    .slice(0, 2)
    .map((passage) => {
      const membership = `Verified section membership: page ${passage.page} passage belongs to "${passage.precedingHeading}".`
      const boundary = passage.followingHeading
        ? ` The following heading "${passage.followingHeading}" starts after that passage.`
        : ""
      return `${membership}${boundary}`
    })
    .join("\n")
}

let cachedRetrieval: {
  readonly pageTexts: readonly string[]
  readonly index: PdfRetrievalIndex
} | null = null

function retrievalIndexFor(pageTexts: readonly string[]): PdfRetrievalIndex {
  const cached = cachedRetrieval
  if (
    cached &&
    cached.pageTexts.length === pageTexts.length &&
    cached.pageTexts.every((text, index) => text === pageTexts[index])
  )
    return cached.index
  const index = buildPdfRetrievalIndex(pageTexts)
  cachedRetrieval = { pageTexts, index }
  return index
}

export function paperContextForQuestion(question: string, currentPage: number): string {
  const ast = activeDocumentAst()
  if (ast) {
    const index = retrievalIndexFor(pageTextsWithParsedPages(ast))
    const matches = rankedResultsForQuestion(index, question)
    return [
      sectionMembershipContext(question),
      ...matches.slice(0, 8).map((result) => contextSnippetForResult(index, result)),
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, AI_CONTEXT_MAX_CHARACTERS)
  }
  const terms = question
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((term) => term.length >= 2)
  const pages = Array.from(document.querySelectorAll<HTMLElement>(".page")).flatMap((page) => {
    const pageNumber = Number(page.getAttribute("data-page-number"))
    const text = page
      .querySelector<HTMLElement>(".textLayer")
      ?.textContent?.replace(/\s+/gu, " ")
      .trim()
    if (!Number.isInteger(pageNumber) || !text) return []
    const normalized = text.toLocaleLowerCase()
    const score =
      terms.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0) +
      (pageNumber === currentPage ? 1 : 0)
    return [{ pageNumber, text, score }]
  })
  return pages
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, 4)
    .map((page) => `Page ${page.pageNumber}: ${page.text}`)
    .join("\n\n")
    .slice(0, AI_CONTEXT_MAX_CHARACTERS)
}

export async function preparePaperContextForQuestion(
  documentId: DocumentId,
  question: string,
  currentPage: number,
  signal?: AbortSignal,
): Promise<string> {
  const ast = activeDocumentAst()
  if (!ast) return paperContextForQuestion(question, currentPage)
  const nativeIndex = buildPdfRetrievalIndex(pageTextsFromAst(ast))
  const matchingPages = rankedResultsForQuestion(nativeIndex, question)
    .map((result) => result.page)
    .filter((page, index, pages) => pages.indexOf(page) === index)
    .slice(0, 3)
  const pagesToLoad = new Set<number>()
  for (const page of matchingPages) {
    if (page > 1) pagesToLoad.add(page - 1)
    pagesToLoad.add(page)
  }
  await Promise.all(
    [...pagesToLoad].map((page) =>
      loadParsedDocumentPage(documentId, page, {
        signal,
      }),
    ),
  )
  return paperContextForQuestion(question, currentPage)
}

export function paperOverviewContext(): string {
  const ast = activeDocumentAst()
  if (ast) return overviewFromPageTexts(pageTextsWithParsedPages(ast))
  const pages = Array.from(document.querySelectorAll<HTMLElement>(".page")).flatMap((page) => {
    const pageNumber = Number(page.getAttribute("data-page-number"))
    const text = page
      .querySelector<HTMLElement>(".textLayer")
      ?.textContent?.replace(/\s+/gu, " ")
      .trim()
    if (!Number.isInteger(pageNumber) || !text) return []
    const score =
      (pageNumber === 1 ? 8 : 0) +
      (/\b(?:method|approach|framework)\b/iu.test(text) ? 4 : 0) +
      (/\b(?:experiment|result|evaluation)\b/iu.test(text) ? 3 : 0) +
      (/\b(?:conclusion|limitation|discussion)\b/iu.test(text) ? 3 : 0)
    return [{ pageNumber, text, score }]
  })
  return pages
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, 6)
    .map((page) => `Page ${page.pageNumber}: ${page.text}`)
    .join("\n\n")
    .slice(0, AI_CONTEXT_MAX_CHARACTERS)
}

function overviewFromPageTexts(pageTexts: readonly string[]): string {
  return pageTexts
    .flatMap((text, index) => {
      const pageNumber = index + 1
      const score =
        (pageNumber === 1 ? 8 : 0) +
        (/\b(?:method|approach|framework)\b/iu.test(text) ? 4 : 0) +
        (/\b(?:experiment|result|evaluation)\b/iu.test(text) ? 3 : 0) +
        (/\b(?:conclusion|limitation|discussion)\b/iu.test(text) ? 3 : 0)
      return text.trim() ? [{ pageNumber, text: text.replace(/\s+/gu, " ").trim(), score }] : []
    })
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, 6)
    .map((page) => `Page ${page.pageNumber}: ${page.text}`)
    .join("\n\n")
    .slice(0, AI_CONTEXT_MAX_CHARACTERS)
}

const paperOverviewCache = new Map<string, string>()

export function cachedPaperOverviewContext(documentId: string): string {
  const cached = paperOverviewCache.get(documentId)
  if (cached) return cached
  const context = paperOverviewContext()
  if (context) paperOverviewCache.set(documentId, context)
  return context
}
