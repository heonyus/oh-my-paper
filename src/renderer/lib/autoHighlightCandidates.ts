import type { ParsedDocumentPage } from "../../shared/documentPageModel"
import type { BoardTextSelection } from "./boardSelection"
import { activeParsedDocumentPages } from "./documentPageRuntime"
import { rectsToElementSpace } from "./selectionGeometry"

const QUOTE_MAX_LENGTH = 300
const DEFAULT_CANDIDATE_LIMIT = 60
const EVIDENCE_MAX_LENGTH = 12_000

export type AutoHighlightLocation =
  | { readonly kind: "native" }
  | { readonly kind: "ocr"; readonly blockId: string }

export type AutoHighlightCandidate = {
  readonly id: string
  readonly page: number
  readonly quote: string
  readonly location: AutoHighlightLocation
}

type TextPosition = { readonly node: Text; readonly offset: number }

export function normalizeForMatch(value: string): string {
  return value.replace(/\s+/gu, " ").trim()
}

function isNoiseQuote(quote: string): boolean {
  if (/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|\b(?:doi|arXiv):|https?:\/\//iu.test(quote)) return true
  if (/^\s*(?:\[\d+\]|\d+[.)])\s/iu.test(quote)) return true
  if (/^\s*(?:table|tab\.?|figure|fig\.?|equation)\s*\d+/iu.test(quote)) return true
  if (/[|\t]/u.test(quote)) return true
  if (
    /\b(?:university|institute|department|laboratory|school|college|hospital|center)\b/iu.test(
      quote,
    ) &&
    !/[.!?]/u.test(quote)
  )
    return true
  const words = quote.split(/\s+/u).filter(Boolean)
  const numericWords = words.filter((word) => /^[-+]?\d+(?:\.\d+)?%?$/u.test(word))
  return words.length >= 6 && numericWords.length >= 4 && numericWords.length / words.length >= 0.4
}

function candidateScore(quote: string): number {
  let score = Math.min(quote.length / 100, 3)
  if (/\b(?:we|our)\s+(?:present|propose|introduce|find|show|achieve)\b/iu.test(quote)) score += 4
  if (/\b(?:contribution|method|approach|result|improv|outperform|limitation)\w*\b/iu.test(quote))
    score += 2
  return score
}

function evidenceFor(candidates: readonly AutoHighlightCandidate[]): string {
  return JSON.stringify({
    candidates: candidates.map(({ id, page, quote }) => ({ id, page, quote })),
  })
}

function fitEvidenceBudget(
  candidates: readonly AutoHighlightCandidate[],
): readonly AutoHighlightCandidate[] {
  const selected: AutoHighlightCandidate[] = []
  for (const candidate of candidates) {
    const next = [...selected, candidate]
    if (evidenceFor(next).length > EVIDENCE_MAX_LENGTH) break
    selected.push(candidate)
  }
  return selected
}

export function normalizedTextIndex(textLayer: HTMLElement): {
  readonly text: string
  readonly positions: readonly TextPosition[]
} {
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT)
  const positions: TextPosition[] = []
  let text = ""
  let previousNode: Text | null = null
  let node = walker.nextNode()
  while (node instanceof Text) {
    const value = node.nodeValue ?? ""
    if (
      text.length > 0 &&
      previousNode !== null &&
      previousNode.parentElement !== node.parentElement &&
      !text.endsWith(" ") &&
      !/^\s/u.test(value)
    ) {
      text += " "
      positions.push({ node, offset: 0 })
    }
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index] ?? ""
      if (/\s/u.test(character)) {
        if (text.length > 0 && !text.endsWith(" ")) {
          text += " "
          positions.push({ node, offset: index })
        }
        continue
      }
      text += character
      positions.push({ node, offset: index })
    }
    previousNode = node
    node = walker.nextNode()
  }
  return { text, positions }
}

function sentenceCandidates(
  pageElement: HTMLElement,
  page: number,
): readonly (AutoHighlightCandidate & { readonly score: number })[] {
  const textLayer = pageElement.querySelector<HTMLElement>(".textLayer")
  if (!textLayer) return []
  const { text } = normalizedTextIndex(textLayer)
  if (!text) return []
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" })
  return [...segmenter.segment(text)].flatMap((segment, index) => {
    const quote = normalizeForMatch(segment.segment)
    if (quote.length < 20 || quote.length > QUOTE_MAX_LENGTH || isNoiseQuote(quote)) return []
    return [
      {
        id: `native:p${page}:s${index + 1}`,
        page,
        quote,
        location: { kind: "native" },
        score: candidateScore(quote),
      },
    ]
  })
}

function ocrCandidates(
  page: ParsedDocumentPage,
): readonly (AutoHighlightCandidate & { readonly score: number })[] {
  return page.blocks.flatMap((block) => {
    if (block.label !== "text" && block.label !== "list") return []
    const quote = normalizeForMatch(block.content)
    if (quote.length < 20 || quote.length > QUOTE_MAX_LENGTH || isNoiseQuote(quote)) return []
    return [
      {
        id: `ocr:p${page.pageNumber}:b${block.order}`,
        page: page.pageNumber,
        quote,
        location: { kind: "ocr", blockId: block.id },
        score: candidateScore(quote),
      },
    ]
  })
}

export function collectAutoHighlightCandidates(
  maximum = DEFAULT_CANDIDATE_LIMIT,
): readonly AutoHighlightCandidate[] {
  const candidates: (AutoHighlightCandidate & { readonly score: number })[] = []
  const nativePages = new Set<number>()
  for (const pageElement of document.querySelectorAll<HTMLElement>(".page")) {
    const page = Number(pageElement.getAttribute("data-page-number"))
    if (!Number.isInteger(page) || page < 1) continue
    const pageCandidates = sentenceCandidates(pageElement, page)
    if (pageCandidates.length > 0) nativePages.add(page)
    candidates.push(...pageCandidates)
  }
  for (const page of activeParsedDocumentPages()) {
    if (nativePages.has(page.pageNumber)) continue
    candidates.push(...ocrCandidates(page))
  }
  const ranked = [...candidates]
    .sort(
      (left, right) =>
        right.score - left.score || left.page - right.page || left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(1, maximum))
    .map(({ score: _score, ...candidate }) => candidate)
  return fitEvidenceBudget(ranked)
}

export function autoHighlightSourceEvidence(candidates: readonly AutoHighlightCandidate[]): string {
  return evidenceFor(fitEvidenceBudget(candidates))
}

export function selectionFromOcrBlock(
  candidate: AutoHighlightCandidate,
  page: ParsedDocumentPage,
  boardWorld: HTMLElement,
): BoardTextSelection | null {
  const location = candidate.location
  if (location.kind === "native") return null
  const block = page.blocks.find((item) => item.id === location.blockId)
  const pageElement = document.querySelector<HTMLElement>(
    `.page[data-page-number="${page.pageNumber}"]`,
  )
  if (!block || !pageElement) return null
  const pageRect = pageElement.getBoundingClientRect()
  const worldRect = boardWorld.getBoundingClientRect()
  const fragments = rectsToElementSpace(
    [
      {
        left: pageRect.left + (block.bounds.x / page.width) * pageRect.width,
        top: pageRect.top + (block.bounds.y / page.height) * pageRect.height,
        width: (block.bounds.width / page.width) * pageRect.width,
        height: (block.bounds.height / page.height) * pageRect.height,
      },
    ],
    { left: worldRect.left, top: worldRect.top, width: worldRect.width, height: worldRect.height },
    { width: boardWorld.offsetWidth, height: boardWorld.offsetHeight },
  )
  const fragment = fragments[0]
  if (!fragment) return null
  return {
    page: page.pageNumber,
    quote: candidate.quote,
    fragments,
    cardPosition: { x: fragment.x + fragment.width + 32, y: fragment.y },
    context: { before: "", after: "" },
  }
}
