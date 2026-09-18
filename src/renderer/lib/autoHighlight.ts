import type { BoardCard, DocumentId } from "../types"
import { createSelectionCard } from "./board"
import { type BoardTextSelection, captureNativeBoardTextSelection } from "./boardSelection"

export const AUTO_HIGHLIGHT_MAX_PASSAGES = 6
const QUOTE_MAX_LENGTH = 300

export type AutoHighlightPassage = {
  readonly quote: string
  readonly reason: string
}

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/gu, " ").trim()
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
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as { passages?: unknown }).passages
      : null
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const passages: AutoHighlightPassage[] = []
  for (const item of list) {
    if (passages.length >= AUTO_HIGHLIGHT_MAX_PASSAGES) break
    if (!item || typeof item !== "object") continue
    const { quote, reason } = item as { quote?: unknown; reason?: unknown }
    if (typeof quote !== "string") continue
    const normalizedQuote = normalizeForMatch(quote)
    if (normalizedQuote.length < 20 || normalizedQuote.length > QUOTE_MAX_LENGTH) continue
    const key = normalizedQuote.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    passages.push({
      quote: normalizedQuote,
      reason: typeof reason === "string" ? normalizeForMatch(reason).slice(0, 80) : "",
    })
  }
  return passages
}

type TextPosition = { readonly node: Text; readonly offset: number }

function normalizedTextIndex(textLayer: HTMLElement): {
  readonly text: string
  readonly positions: readonly TextPosition[]
} {
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT)
  const positions: TextPosition[] = []
  let text = ""
  let node = walker.nextNode()
  while (node instanceof Text) {
    const value = node.nodeValue ?? ""
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
    node = walker.nextNode()
  }
  return { text, positions }
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

export function createAutoHighlightCard(
  documentId: DocumentId,
  passage: AutoHighlightPassage,
  boardWorld: HTMLElement,
): BoardCard | null {
  const selection = locateQuoteSelection(passage.quote, boardWorld)
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
