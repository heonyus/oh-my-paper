import { useCallback } from "react"
import type { DocumentId, Workspace } from "../../shared/schemas"
import { paperDiscussionStorageKey } from "../components/PaperDiscussion"
import { normalizeWorkspaceTranslations } from "./cardPresentation"
import { pageTranslationModeKey } from "./pageTranslationMode"

function forgetLocalDocumentState(id: DocumentId): void {
  try {
    window.localStorage.removeItem(paperDiscussionStorageKey(id))
    window.localStorage.removeItem(pageTranslationModeKey(id))
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}

/**
 * Deletes a document on the server, then adopts the server's workspace so a pending
 * local save cannot resurrect the removed record.
 */
export function useDocumentDeletion(
  resetWorkspace: (workspace: Workspace) => void,
): ((id: DocumentId) => Promise<void>) | undefined {
  const deleteDocument = window.ohmypaper.deleteDocument
  const remove = useCallback(
    async (id: DocumentId): Promise<void> => {
      if (!deleteDocument) return
      await deleteDocument(id)
      forgetLocalDocumentState(id)
      resetWorkspace(normalizeWorkspaceTranslations(await window.ohmypaper.readWorkspace()))
    },
    [deleteDocument, resetWorkspace],
  )
  return deleteDocument ? remove : undefined
}
