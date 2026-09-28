import type { DocumentId } from "../shared/ids"
import type { Workspace } from "../shared/schemas"
import { forgetOwnSummary, readOwnSummaries, saveOwnSummaries } from "./ownSummariesFile"
import { forgetReaderNote, readReaderNotes, saveReaderNotes } from "./readerNotesFiles"

/** The reader's own writing, kept in files beside the knowledge database. */
export type LearningFiles = Pick<Workspace, "ownSummaries" | "readerNotes">

export async function readLearningFiles(root: string): Promise<LearningFiles> {
  const [ownSummaries, readerNotes] = await Promise.all([
    readOwnSummaries(root),
    readReaderNotes(root),
  ])
  return { ownSummaries, readerNotes }
}

export async function saveLearningFiles(
  root: string,
  base: LearningFiles | undefined,
  incoming: LearningFiles,
): Promise<void> {
  await saveOwnSummaries(root, base?.ownSummaries, incoming.ownSummaries)
  await saveReaderNotes(root, base?.readerNotes, incoming.readerNotes)
}

export async function forgetLearningFiles(root: string, documentId: DocumentId): Promise<void> {
  await forgetOwnSummary(root, documentId)
  await forgetReaderNote(root, documentId)
}
