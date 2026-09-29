import { useCallback, useEffect, useRef, useState } from "react"
import type { Workspace } from "../../shared/schemas"
import { mergeWorkspaceForSave } from "../../shared/workspaceMerge"
import type { WorkspaceSetter } from "./useWorkspaceHistory"
import { saveWorkspaceChanges } from "./workspaceSave"

export function useWorkspacePersistence(
  workspace: Workspace | null,
  onAcknowledged: WorkspaceSetter,
): boolean {
  const [failed, setFailed] = useState(false)
  const latest = useRef<Workspace | null>(workspace)
  const saved = useRef<Workspace | null>(null)
  // The workspace the backend last acknowledged, as the base for the next patch save.
  const baseline = useRef<Workspace | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)

  const persistLatest = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    const operation = (async (): Promise<void> => {
      while (latest.current && latest.current !== saved.current) {
        const next = latest.current
        try {
          const acknowledged = await saveWorkspaceChanges(baseline.current, next)
          baseline.current = acknowledged
          const pending = latest.current ?? next
          const merged =
            pending === next ? acknowledged : mergeWorkspaceForSave(next, acknowledged, pending)
          latest.current = merged
          saved.current = pending === next ? merged : acknowledged
          onAcknowledged((current) => (current === pending ? merged : current))
          setFailed(false)
          setRetryAttempt(0)
        } catch (error) {
          setFailed(true)
          throw error
        }
      }
    })()
    inFlight.current = operation
    return operation.finally(() => {
      inFlight.current = null
    })
  }, [onAcknowledged])

  useEffect(() => {
    latest.current = workspace
    if (!workspace) return
    const timer = window.setTimeout(
      () => {
        void persistLatest().catch(() => setFailed(true))
      },
      retryAttempt === 0 ? 220 : 0,
    )
    return () => window.clearTimeout(timer)
  }, [persistLatest, retryAttempt, workspace])

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

  return failed
}
