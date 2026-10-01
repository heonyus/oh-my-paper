import { useCallback, useMemo, useRef } from "react"
import type { DocumentId, Workspace } from "../../shared/schemas"
import { appendNoteCard } from "./noteCard"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

/** Adds a note card to a note that is open in an editor; false when the note is full. */
export type LiveNoteAppender = (card: string) => boolean
export type RegisterLiveNote = (documentId: DocumentId, append: LiveNoteAppender) => () => void

function withNoteMarkdown(workspace: Workspace, documentId: DocumentId, markdown: string) {
  const existing = workspace.readerNotes.find((item) => item.documentId === documentId)
  if (existing?.markdown === markdown) return workspace
  return {
    ...workspace,
    readerNotes: [
      ...workspace.readerNotes.filter((item) => item.documentId !== documentId),
      { documentId, markdown, updatedAt: new Date().toISOString() },
    ],
  }
}

/**
 * The open paper's note, and note cards for any note. Updates skip the board's undo history:
 * the editor keeps its own, and typing must never be undone by the reader toolbar's undo.
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
  const updateNote = useCallback(
    (id: DocumentId, markdown: string): void => {
      setWorkspaceTransient((current) =>
        current ? withNoteMarkdown(current, id, markdown) : current,
      )
    },
    [setWorkspaceTransient],
  )
  const update = useCallback(
    (markdown: string): void => {
      if (documentId) updateNote(documentId, markdown)
    },
    [documentId, updateNote],
  )

  // A note open in an editor takes cards through it, so the editor never overwrites them.
  const liveNotes = useRef(new Map<DocumentId, LiveNoteAppender>())
  const registerLiveNote = useCallback<RegisterLiveNote>((id, append) => {
    liveNotes.current.set(id, append)
    return () => {
      if (liveNotes.current.get(id) === append) liveNotes.current.delete(id)
    }
  }, [])
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const appendToNote = useCallback(
    (id: DocumentId, card: string): boolean => {
      const live = liveNotes.current.get(id)
      if (live) return live(card)
      const stored = workspaceRef.current?.readerNotes.find((item) => item.documentId === id)
      if (appendNoteCard(stored?.markdown ?? "", card) === null) return false
      setWorkspaceTransient((current) => {
        if (!current) return current
        const existing = current.readerNotes.find((item) => item.documentId === id)
        const next = appendNoteCard(existing?.markdown ?? "", card)
        return next === null ? current : withNoteMarkdown(current, id, next)
      })
      return true
    },
    [setWorkspaceTransient],
  )
  return { note, update, updateNote, registerLiveNote, appendToNote }
}
