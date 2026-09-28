import { z } from "zod"
import { documentIdSchema } from "./ids"
import { mergeKeyedRecords } from "./keyedMerge"

export const READER_NOTE_MAX_CHARACTERS = 200_000
export const READER_NOTES_MAX = 5_000

/** The reader's own Markdown note for one paper; the AI never writes into it. */
export const readerNoteSchema = z.object({
  documentId: documentIdSchema,
  markdown: z.string().max(READER_NOTE_MAX_CHARACTERS),
  updatedAt: z.string().datetime(),
})

export type ReaderNote = z.infer<typeof readerNoteSchema>

export function mergeReaderNotes(
  base: readonly ReaderNote[],
  current: readonly ReaderNote[],
  incoming: readonly ReaderNote[],
): readonly ReaderNote[] {
  return mergeKeyedRecords(base, current, incoming, (note) => note.documentId)
}
