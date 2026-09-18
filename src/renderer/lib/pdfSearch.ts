import { AI_CONTEXT_MAX_CHARACTERS } from "../../shared/ipc"
import { pageTextsFromAst } from "./documentAstProjection"
import { activeDocumentAst } from "./documentAstRuntime"
import { activeParsedDocumentPages } from "./documentPageRuntime"
import { parsedPageBodyText } from "./parsedPageTranslation"

const RETRIEVAL_CHUNK_SIZE = 900
const RETRIEVAL_CHUNK_STEP = 720
const RETRIEVAL_RESULT_LIMIT = 5

type PdfRetrievalChunk = {
  readonly id: string
  readonly page: number
  readonly text: string
  readonly normalized: string
  readonly tokens: readonly string[]
}

function pageTextsWithParsedPages(
  ast: NonNullable<ReturnType<typeof activeDocumentAst>>,
): readonly string[] {
  const pageTexts = [...pageTextsFromAst(ast)]
  for (const page of activeParsedDocumentPages()) {
    if (page.sourceHash !== ast.sourceHash) continue
    const text = parsedPageBodyText(page)
    if (text) pageTexts[page.pageNumber - 1] = text
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
      return {
        id: `${pageIndex + 1}:${chunkIndex}`,
        page: pageIndex + 1,
        text: chunkText,
        normalized: normalizedText(chunkText),
        tokens: retrievalTokens(chunkText),
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
    const tokenCounts = new Map<string, number>()
    for (const token of chunk.tokens) tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1)
    const matchedTokens = queryTokens.filter((token) => tokenCounts.has(token))
    const coverage = matchedTokens.length / queryTokens.length
    const lexical = matchedTokens.reduce((score, token) => {
      const frequency = tokenCounts.get(token) ?? 0
      const documents = index.documentFrequency.get(token) ?? 0
      const inverseFrequency = Math.log((index.chunks.length + 1) / (documents + 1)) + 1
      return score + (1 + Math.log(frequency)) * inverseFrequency
    }, 0)
    const phrase = chunk.normalized.includes(normalizedQuery) ? 12 : 0
    const characterSimilarity = overlapRatio(queryGrams, trigrams(chunk.text))
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

export function paperContextForQuestion(question: string, currentPage: number): string {
  const ast = activeDocumentAst()
  if (ast) {
    return rankPdfPassages(buildPdfRetrievalIndex(pageTextsWithParsedPages(ast)), question)
      .map((result) => `Page ${result.page}: ${result.snippet}`)
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
