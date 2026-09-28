import { useState } from "react"
import type { DocumentId, Workspace } from "../../shared/schemas"
import { useOwnSummary } from "./useOwnSummary"
import { useReaderNote } from "./useReaderNote"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

/** The open paper's own writing: the three lines and the note, plus whether the note is open. */
export function useReaderLearning(
  workspace: Workspace | null,
  documentId: DocumentId | undefined,
  setWorkspace: WorkspaceSetter,
  setWorkspaceTransient: WorkspaceSetter,
) {
  const [noteOpen, setNoteOpen] = useState(false)
  const summary = useOwnSummary(workspace, documentId, setWorkspace)
  const note = useReaderNote(workspace, documentId, setWorkspaceTransient)
  return {
    ownSummary: summary.summary,
    updateOwnSummary: summary.update,
    readerNote: note.note,
    updateReaderNote: note.update,
    noteOpen,
    setNoteOpen,
  }
}
