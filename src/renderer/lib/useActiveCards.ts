import { useCallback, useMemo } from "react"
import type { BoardCard, DocumentId, Workspace } from "../../shared/schemas"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

function replaceDocumentCards(
  workspace: Workspace,
  documentId: DocumentId,
  cards: readonly BoardCard[],
): Workspace {
  return {
    ...workspace,
    cards: [...workspace.cards.filter((card) => card.documentId !== documentId), ...cards],
  }
}

export function useActiveCards(
  workspace: Workspace | null,
  documentId: DocumentId | null,
  setWorkspace: WorkspaceSetter,
  setWorkspaceTransient: WorkspaceSetter,
): {
  readonly cards: readonly BoardCard[]
  readonly update: (cards: readonly BoardCard[]) => void
  readonly preview: (cards: readonly BoardCard[]) => void
} {
  const cards = useMemo(
    () => workspace?.cards.filter((card) => card.documentId === documentId) ?? [],
    [documentId, workspace],
  )
  const update = useCallback(
    (next: readonly BoardCard[]): void => {
      if (!documentId) return
      setWorkspace((current) =>
        current ? replaceDocumentCards(current, documentId, next) : current,
      )
    },
    [documentId, setWorkspace],
  )
  const preview = useCallback(
    (next: readonly BoardCard[]): void => {
      if (!documentId) return
      setWorkspaceTransient((current) =>
        current ? replaceDocumentCards(current, documentId, next) : current,
      )
    },
    [documentId, setWorkspaceTransient],
  )
  return { cards, update, preview }
}
