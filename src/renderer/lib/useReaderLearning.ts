import { useState } from "react"
import type { DocumentId, Workspace } from "../../shared/schemas"
import { useReaderNote } from "./useReaderNote"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

/** The open paper's own note, plus whether the note is open. */
export function useReaderLearning(
  workspace: Workspace | null,
  documentId: DocumentId | undefined,
  setWorkspaceTransient: WorkspaceSetter,
) {
  const [noteOpen, setNoteOpen] = useState(false)
  const note = useReaderNote(workspace, documentId, setWorkspaceTransient)
  return {
    readerNote: note.note,
    updateReaderNote: note.update,
    noteOpen,
    setNoteOpen,
  }
}
