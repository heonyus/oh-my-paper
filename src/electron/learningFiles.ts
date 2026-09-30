import type { DocumentId } from "../shared/ids"
import type { ReaderNote } from "../shared/readerNote"
import type { Workspace } from "../shared/schemas"
import { forgetReaderNote, saveReaderNotes } from "./readerNotesFiles"

/** The reader's own writing, kept in files beside the knowledge database. */
export type LearningFiles = Pick<Workspace, "readerNotes">

/** Merges a save into the files; `stored` is what the caller just read from them. */
export async function saveLearningFiles(
  root: string,
  base: LearningFiles | undefined,
  incoming: LearningFiles,
  stored: { readonly readerNotes: readonly ReaderNote[] },
): Promise<void> {
  await saveReaderNotes(root, base?.readerNotes, incoming.readerNotes, stored.readerNotes)
}

export async function forgetLearningFiles(root: string, documentId: DocumentId): Promise<void> {
  await forgetReaderNote(root, documentId)
}
