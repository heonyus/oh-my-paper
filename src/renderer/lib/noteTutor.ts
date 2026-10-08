import type { AiRequest } from "../../shared/ipc"
import { AI_SOURCE_EVIDENCE_MAX_CHARACTERS } from "../../shared/ipc"
import type { ReaderNote } from "../../shared/readerNote"
import type { DocumentId } from "../../shared/schemas"
import { sourceContainsQuote } from "./sourceQuoteFlash"

export type TutorPassage = { readonly page: number; readonly text: string }
export type EarlierNote = { readonly id: string; readonly title: string; readonly text: string }

const CITATION = /\[\[\s*p\.?\s*(\d{1,4})\s*\|\s*([^\]\n]{1,300}?)\s*\]\]/gu
/** The page a note card was written at, `[[p.N]]`, which quotes nothing. */
const PAGE_CHIP = /\[\[\s*p\.?\s*\d{1,4}\s*\]\]/gu
const EARLIER_NOTES_MAX = 150
const EARLIER_NOTE_MIN_CHARACTERS = 20

/** The reader's own paragraphs from other papers, as plain text they can be matched by. */
export function earlierNoteParagraphs(
  notes: readonly ReaderNote[],
  titles: ReadonlyMap<DocumentId, string>,
  excluding: DocumentId,
): readonly EarlierNote[] {
  const paragraphs: EarlierNote[] = []
  for (const note of notes) {
    if (note.documentId === excluding) continue
    const title = titles.get(note.documentId)
    if (!title) continue
    note.markdown.split(/\n\s*\n/u).forEach((block, index) => {
      const text = block
        .replace(CITATION, "")
        .replace(PAGE_CHIP, "")
        .replace(/^\s*(?:#{1,6}|[-*+]|\d+\.|>)\s*/gmu, "")
        .replace(/[*_`]/gu, "")
        .replace(/\s+/gu, " ")
        .trim()
      if (text.length >= EARLIER_NOTE_MIN_CHARACTERS)
        paragraphs.push({ id: `${note.documentId}:${index}`, title, text })
    })
  }
  return paragraphs.slice(-EARLIER_NOTES_MAX)
}

const EARLIER_LINES_LABEL =
  "Lines the reader wrote earlier in this note, already answered; for reference only:"

export function noteTutorRequest(input: {
  readonly paragraph: string
  readonly earlierLines: string
  readonly passages: readonly TutorPassage[]
  readonly earlierNotes: readonly EarlierNote[]
  readonly page: number
}): Omit<AiRequest, "documentId"> {
  const passages = input.passages.map((passage) => `[Page ${passage.page}]\n${passage.text}`)
  const notes = input.earlierNotes.map((note) => `〈${note.title}〉 ${note.text}`)
  const evidence = [
    passages.length
      ? `PAPER PASSAGES RELATED TO THE READER'S PARAGRAPH:\n${passages.join("\n\n")}`
      : "",
    notes.length ? `THE READER'S EARLIER NOTES ON OTHER PAPERS:\n${notes.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
  return {
    action: "note_tutor",
    page: input.page,
    quote: input.paragraph.slice(0, 2_000),
    before: "",
    after: "",
    // Labeled, or the model answers the earlier lines instead of the new paragraph.
    ...(input.earlierLines
      ? { sectionContext: `${EARLIER_LINES_LABEL}\n${input.earlierLines.slice(-1_900)}` }
      : {}),
    ...(evidence ? { sourceEvidence: evidence.slice(0, AI_SOURCE_EVIDENCE_MAX_CHARACTERS) } : {}),
  }
}

function citationsHold(sentence: string, pageTexts: readonly string[]): boolean {
  for (const match of sentence.matchAll(CITATION)) {
    const text = pageTexts[Number(match[1]) - 1]
    if (text === undefined || !sourceContainsQuote(text, match[2] ?? "")) return false
  }
  return true
}

/**
 * What the reader sees of a tutor reply: declarative sentences only, and only those whose
 * citations are really on the page they name. The tutor never gets to ask or to invent.
 */
export function cleanTutorText(text: string, pageTexts: readonly string[]): string {
  return text
    .replace(/\s+/gu, " ")
    .split(/(?<=[.!?。…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !/[?？]\s*(?:\[\[[^\]]*\]\])?\s*$/u.test(sentence))
    .filter((sentence) => citationsHold(sentence, pageTexts))
    .join(" ")
}

/** While a reply streams, only finished sentences show, and only once they pass the same checks. */
export function visibleTutorText(text: string, pageTexts: readonly string[]): string {
  let finished = -1
  for (const match of text.matchAll(/[.!?。…](?=\s)/gu)) finished = match.index
  return finished < 0 ? "" : cleanTutorText(text.slice(0, finished + 1), pageTexts)
}
