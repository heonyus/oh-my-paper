import { useCallback, useMemo } from "react"
import type { DocumentId, Workspace } from "../../shared/schemas"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

/**
 * The open paper's note. Updates skip the board's undo history: the editor keeps its own, and
 * typing must never be undone by the reader toolbar's undo.
 */
export function useReaderNote(
  workspace: Workspace | null,
  documentId: DocumentId | undefined,
  setWorkspaceTransient: WorkspaceSetter,
) {
  const note = useMemo(
    () => workspace?.readerNotes.find((candidate) => candidate.documentId === documentId),
    [workspace, documentId],
  )
  const update = useCallback(
    (markdown: string): void => {
      if (!documentId) return
      setWorkspaceTransient((current) => {
        if (!current) return current
        const existing = current.readerNotes.find((item) => item.documentId === documentId)
        if (existing?.markdown === markdown) return current
        return {
          ...current,
          readerNotes: [
            ...current.readerNotes.filter((item) => item.documentId !== documentId),
            { documentId, markdown, updatedAt: new Date().toISOString() },
          ],
        }
      })
    },
    [documentId, setWorkspaceTransient],
  )
  return { note, update }
}
