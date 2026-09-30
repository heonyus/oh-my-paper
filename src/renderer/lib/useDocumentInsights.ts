import { useCallback, useMemo } from "react"
import type { DocumentId, DocumentInsightKind, Workspace } from "../../shared/schemas"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

/** The workspace with one paper's overview answer of `kind` set to `value`. */
export function withDocumentInsight(
  workspace: Workspace,
  documentId: DocumentId,
  kind: DocumentInsightKind,
  value: string,
): Workspace {
  return {
    ...workspace,
    insights: [
      ...workspace.insights.filter(
        (insight) => insight.documentId !== documentId || insight.kind !== kind,
      ),
      { documentId, kind, value, updatedAt: new Date().toISOString() },
    ],
  }
}

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
        current ? withDocumentInsight(current, documentId, kind, value) : current,
      )
    },
    [documentId, setWorkspace],
  )
  return { insights, update }
}
