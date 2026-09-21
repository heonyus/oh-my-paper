import { z } from "zod"
import type { BoardCard, DocumentId } from "../../shared/schemas"
import {
  type AutoHighlightCandidate,
  normalizedTextIndex,
  normalizeForMatch,
  selectionFromOcrBlock,
} from "./autoHighlightCandidates"
import { createSelectionCard } from "./board"
import { type BoardTextSelection, captureNativeBoardTextSelection } from "./boardSelection"
import { activeParsedDocumentPages } from "./documentPageRuntime"

export const AUTO_HIGHLIGHT_MAX_PASSAGES = 6
const QUOTE_MAX_LENGTH = 300

export type AutoHighlightPassage = {
  readonly candidateId: string | null
  readonly quote: string
  readonly reason: string
}

export function parseAutoHighlightResponse(text: string): AutoHighlightPassage[] {
  const cleaned = text
    .replace(/```(?:json)?/giu, " ")
    .replace(/^[^{[]*/u, "")
    .replace(/[^\]}]*$/u, "")
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return []
  }
  const selectionResult = z
    .object({
      selections: z.array(
        z.object({
          candidateId: z.string().trim().min(1).max(160),
          reason: z.string().optional(),
        }),
      ),
    })
    .safeParse(parsed)
  if (selectionResult.success) {
    const seen = new Set<string>()
    return selectionResult.data.selections
      .slice(0, AUTO_HIGHLIGHT_MAX_PASSAGES)
      .flatMap((selection) => {
        if (seen.has(selection.candidateId)) return []
        seen.add(selection.candidateId)
        return [
          {
            candidateId: selection.candidateId,
            quote: "",
            reason: selection.reason ? normalizeForMatch(selection.reason).slice(0, 80) : "",
          },
        ]
      })
  }
  const legacyList = z
    .object({
      passages: z.array(z.unknown()),
    })
    .safeParse(parsed)
  const list = Array.isArray(parsed) ? parsed : legacyList.success ? legacyList.data.passages : []
  const seen = new Set<string>()
  const passages: AutoHighlightPassage[] = []
  for (const item of list) {
    if (passages.length >= AUTO_HIGHLIGHT_MAX_PASSAGES) break
    const itemResult = z
      .object({ quote: z.string(), reason: z.string().optional() })
      .safeParse(item)
    if (!itemResult.success) continue
    const { quote, reason } = itemResult.data
    const normalizedQuote = normalizeForMatch(quote)
    if (normalizedQuote.length < 20 || normalizedQuote.length > QUOTE_MAX_LENGTH) continue
    const key = normalizedQuote.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    passages.push({
      candidateId: null,
      quote: normalizedQuote,
      reason: reason ? normalizeForMatch(reason).slice(0, 80) : "",
    })
  }
  return passages
}

function quoteRangeInPage(pageElement: HTMLElement, needle: string): Range | null {
  const textLayer = pageElement.querySelector<HTMLElement>(".textLayer")
  if (!textLayer) return null
  const { text, positions } = normalizedTextIndex(textLayer)
  const start = text.indexOf(needle)
  if (start < 0) return null
  const startPosition = positions[start]
  const endPosition = positions[start + needle.length - 1]
  if (!startPosition || !endPosition) return null
  const range = document.createRange()
  range.setStart(startPosition.node, startPosition.offset)
  range.setEnd(endPosition.node, endPosition.offset + 1)
  return range
}

export function locateQuoteSelection(
  quote: string,
  boardWorld: HTMLElement,
): BoardTextSelection | null {
  const needle = normalizeForMatch(quote)
  if (needle.length < 2) return null
  for (const pageElement of document.querySelectorAll<HTMLElement>(".page")) {
    const range = quoteRangeInPage(pageElement, needle)
    if (!range) continue
    const selection = captureNativeBoardTextSelection({
      pageElement,
      boardWorldElement: boardWorld,
      range,
      quote: range.toString() || needle,
    })
    range.detach()
    if (selection) return selection
  }
  return null
}

function locateCandidateSelection(
  candidate: AutoHighlightCandidate,
  boardWorld: HTMLElement,
): BoardTextSelection | null {
  if (candidate.location.kind === "ocr") {
    const page = activeParsedDocumentPages().find((item) => item.pageNumber === candidate.page)
    return page ? selectionFromOcrBlock(candidate, page, boardWorld) : null
  }
  const pageElement = document.querySelector<HTMLElement>(
    `.page[data-page-number="${candidate.page}"]`,
  )
  if (!pageElement) return null
  const range = quoteRangeInPage(pageElement, candidate.quote)
  if (!range) return null
  const selection = captureNativeBoardTextSelection({
    pageElement,
    boardWorldElement: boardWorld,
    range,
    quote: candidate.quote,
  })
  range.detach()
  return selection
}

export function createAutoHighlightCard(
  documentId: DocumentId,
  passage: AutoHighlightPassage,
  boardWorld: HTMLElement,
  candidates: readonly AutoHighlightCandidate[],
): BoardCard | null {
  const candidate = passage.candidateId
    ? candidates.find((item) => item.id === passage.candidateId)
    : undefined
  if (!candidate) return null
  const selection = locateCandidateSelection(candidate, boardWorld)
  if (!selection) return null
  const card = createSelectionCard(documentId, selection, "highlight")
  if (!card) return null
  return {
    ...card,
    title: passage.reason || card.title,
    body: selection.quote,
    loading: false,
  }
}
