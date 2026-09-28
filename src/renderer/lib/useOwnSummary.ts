import { useCallback, useMemo } from "react"
import type { OwnSummary } from "../../shared/ownSummary"
import type { DocumentId, Workspace } from "../../shared/schemas"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

export type OwnSummaryUpdate = Omit<OwnSummary, "documentId" | "updatedAt">

export function useOwnSummary(
  workspace: Workspace | null,
  documentId: DocumentId | undefined,
  setWorkspace: WorkspaceSetter,
) {
  const summary = useMemo(
    () => workspace?.ownSummaries.find((candidate) => candidate.documentId === documentId),
    [workspace, documentId],
  )
  const update = useCallback(
    (next: OwnSummaryUpdate): void => {
      if (!documentId) return
      setWorkspace((current) =>
        current
          ? {
              ...current,
              ownSummaries: [
                ...current.ownSummaries.filter((candidate) => candidate.documentId !== documentId),
                { ...next, documentId, updatedAt: new Date().toISOString() },
              ],
            }
          : current,
      )
    },
    [documentId, setWorkspace],
  )
  return { summary, update }
}
