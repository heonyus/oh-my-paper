import { LOOSE_NOTE_ID, READER_NOTE_MAX_CHARACTERS } from "../../shared/readerNote"
import type { DocumentId } from "../../shared/schemas"

export const NOTE_CARD_MAX_CHARACTERS = 20_000

/** Where a note card goes: the open paper's note at the page in view, or the loose note. */
export type NoteCardTarget =
  | {
      readonly kind: "paper"
      readonly documentId: DocumentId
      readonly title: string
      readonly page: number
    }
  | { readonly kind: "loose" }

/** A card opened while a paper is on screen goes to its note at that page; elsewhere, loose. */
export function noteCardTarget(
  paper: { readonly id: DocumentId; readonly title: string } | null,
  page: number,
): NoteCardTarget {
  return paper
    ? { kind: "paper", documentId: paper.id, title: paper.title, page: Math.max(1, page) }
    : { kind: "loose" }
}

export function noteCardNoteId(target: NoteCardTarget): DocumentId {
  return target.kind === "paper" ? target.documentId : LOOSE_NOTE_ID
}

/** A line Markdown reads as a heading, list, quote, code fence, table or rule, not as prose. */
const BLOCK_START =
  /^(?: {0,3}(?:#{1,6}\s|[-*+]\s|\d{1,9}[.)]\s|>|`{3}|~{3}|\||[-*_]{3,}\s*$)| {4}|\t)/u

/**
 * The card as note Markdown. On a paper the card starts with a page chip (`[[p.N]]`) that
 * returns to that page: inline before prose, on its own line before any other block.
 */
export function noteCardMarkdown(text: string, target: NoteCardTarget): string {
  const body = text.replace(/\r\n?/gu, "\n").trim()
  if (target.kind === "loose") return body
  const chip = `[[p.${target.page}]]`
  return BLOCK_START.test(body) ? `${chip}\n\n${body}` : `${chip} ${body}`
}

/** What a card adds to a note: a rule setting it apart from what is already there, then the card. */
export function noteCardAddition(noteIsEmpty: boolean, card: string): string {
  return noteIsEmpty ? card : `---\n\n${card}`
}

/** The note with the card appended, or null when the note would outgrow what a note may hold. */
export function appendNoteCard(note: string, card: string): string | null {
  const head = note.trimEnd()
  const next = `${head ? `${head}\n\n` : ""}${noteCardAddition(head === "", card)}\n`
  return next.length > READER_NOTE_MAX_CHARACTERS ? null : next
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  )
}

/**
 * The note card's keys: `N` anywhere text is not being typed, `⌥N` (Alt+N) even while typing.
 * The physical key counts, so a Korean keyboard layout opens it too.
 */
export function isNoteCardShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.repeat || event.isComposing) return false
  if (event.code !== "KeyN" && event.key.toLowerCase() !== "n") return false
  if (event.altKey) return !event.shiftKey
  return !event.shiftKey && !isTypingTarget(event.target)
}
