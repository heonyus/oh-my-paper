import type { DocumentId } from "../shared/ids"
import type { Workspace } from "../shared/schemas"
import { forgetReaderNote, readReaderNotes, saveReaderNotes } from "./readerNotesFiles"

/** The reader's own writing, kept in files beside the knowledge database. */
export type LearningFiles = Pick<Workspace, "readerNotes">

export async function readLearningFiles(root: string): Promise<LearningFiles> {
  return { readerNotes: await readReaderNotes(root) }
}

export async function saveLearningFiles(
  root: string,
  base: LearningFiles | undefined,
  incoming: LearningFiles,
): Promise<void> {
  await saveReaderNotes(root, base?.readerNotes, incoming.readerNotes)
}

export async function forgetLearningFiles(root: string, documentId: DocumentId): Promise<void> {
  await forgetReaderNote(root, documentId)
}
