import { useCallback, useEffect, useRef, useState } from "react"
import type { Workspace } from "../../shared/schemas"
import { mergeWorkspaceForSave } from "../../shared/workspaceMerge"
import type { WorkspaceSetter } from "./useWorkspaceHistory"
import { saveWorkspaceChanges } from "./workspaceSave"

/** `workspace` with this window's own paper open, when that paper is still in it. */
export function withWindowDocument(
  workspace: Workspace,
  documentId: Workspace["activeDocumentId"],
): Workspace {
  if (workspace.activeDocumentId === documentId) return workspace
  if (documentId !== null && !workspace.documents.some((item) => item.id === documentId))
    return workspace
  return { ...workspace, activeDocumentId: documentId }
}

/**
 * Keeps the workspace saved, and reports why the latest save failed while one does: the reason
 * is shown with the failure so it can be read off the screen rather than dug out of a console.
 */
export function useWorkspacePersistence(
  workspace: Workspace | null,
  onAcknowledged: WorkspaceSetter,
  /**
   * The workspace as the backend returned it when the app started. It is already saved, so the
   * first save carries only what has changed since, or nothing: without it every start sent
   * the whole workspace back and checked the whole of it again as it returned, while the
   * paper the reader had just reopened was being drawn.
   */
  stored: Workspace | null = null,
): string | null {
  const [failure, setFailure] = useState<string | null>(null)
  const failed = failure !== null
  const latest = useRef<Workspace | null>(workspace)
  const saved = useRef<Workspace | null>(null)
  // The workspace the backend last acknowledged, as the base for the next patch save.
  const baseline = useRef<Workspace | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  // The reason last written to the console, so retries every half second do not repeat it.
  const reported = useRef<string | null>(null)

  const persistLatest = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    const operation = (async (): Promise<void> => {
      while (latest.current && latest.current !== saved.current) {
        const next = latest.current
        try {
          const stored = await saveWorkspaceChanges(baseline.current, next)
          baseline.current = stored
          // Which paper is open belongs to this window: the paper another window opened comes
          // back with the save and must not replace the one being read here.
          const acknowledged = withWindowDocument(stored, next.activeDocumentId)
          const pending = latest.current ?? next
          const merged =
            pending === next ? acknowledged : mergeWorkspaceForSave(next, acknowledged, pending)
          latest.current = merged
          saved.current = pending === next ? merged : acknowledged
          onAcknowledged((current) => (current === pending ? merged : current))
          setFailure(null)
          setRetryAttempt(0)
          reported.current = null
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          if (reported.current !== reason) {
            reported.current = reason
            console.warn("[workspace] save failed; retrying", error)
          }
          setFailure(reason)
          throw error
        }
      }
    })()
    inFlight.current = operation
    return operation.finally(() => {
      inFlight.current = null
    })
  }, [onAcknowledged])

  const adopted = useRef<Workspace | null>(null)
  useEffect(() => {
    latest.current = workspace
    if (!workspace) return
    if (stored && adopted.current !== stored) {
      adopted.current = stored
      if (baseline.current === null) baseline.current = stored
    }
    const timer = window.setTimeout(
      () => {
        void persistLatest().catch((error: unknown) =>
          setFailure(error instanceof Error ? error.message : String(error)),
        )
      },
      retryAttempt === 0 ? 220 : 0,
    )
    return () => window.clearTimeout(timer)
  }, [persistLatest, retryAttempt, workspace, stored])

  useEffect(() => {
    if (!failed) return
    const timer = window.setTimeout(() => setRetryAttempt(retryAttempt + 1), 500)
    return () => window.clearTimeout(timer)
  }, [failed, retryAttempt])

  useEffect(
    () =>
      window.ohmypaper.onBeforeWorkspaceClose(async () => {
        await persistLatest()
        await window.ohmypaper.flushWorkspace()
      }),
    [persistLatest],
  )

  return failure
}
