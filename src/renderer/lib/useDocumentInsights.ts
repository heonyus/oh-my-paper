import { useCallback, useMemo } from "react"
import type { DocumentId, DocumentInsightKind, Workspace } from "../../shared/schemas"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

export function useDocumentInsights(
  workspace: Workspace | null,
  documentId: DocumentId | undefined,
  setWorkspace: WorkspaceSetter,
) {
  const insights = useMemo(
    () => workspace?.insights.filter((insight) => insight.documentId === documentId) ?? [],
    [workspace, documentId],
  )
  const update = useCallback(
    (kind: DocumentInsightKind, value: string): void => {
      if (!documentId) return
      setWorkspace((current) =>
        current
          ? {
              ...current,
              insights: [
                ...current.insights.filter(
                  (insight) => insight.documentId !== documentId || insight.kind !== kind,
                ),
                { documentId, kind, value, updatedAt: new Date().toISOString() },
              ],
            }
          : current,
      )
    },
    [documentId, setWorkspace],
  )
  return { insights, update }
}
