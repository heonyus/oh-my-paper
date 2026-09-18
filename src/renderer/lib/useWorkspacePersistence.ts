import { useCallback, useEffect, useRef, useState } from "react"
import type { Workspace } from "../../shared/schemas"
import { mergeWorkspaceForSave } from "../../shared/workspaceMerge"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

export function useWorkspacePersistence(
  workspace: Workspace | null,
  onAcknowledged: WorkspaceSetter,
): boolean {
  const [failed, setFailed] = useState(false)
  const latest = useRef<Workspace | null>(workspace)
  const saved = useRef<Workspace | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const failedPayload = useRef<Workspace | null>(null)

  const persistLatest = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    const operation = (async (): Promise<void> => {
      while (latest.current && latest.current !== saved.current) {
        const next = latest.current
        if (next === failedPayload.current)
          throw new Error("저장 충돌을 해결한 뒤 다시 시도하세요.")
        try {
          const acknowledged = await window.scourgify.saveWorkspace({
            ...next,
            baseSnapshotToken: next.snapshotToken,
          })
          const pending = latest.current ?? next
          const merged =
            pending === next ? acknowledged : mergeWorkspaceForSave(next, acknowledged, pending)
          latest.current = merged
          saved.current = pending === next ? merged : acknowledged
          failedPayload.current = null
          onAcknowledged((current) => (current === pending ? merged : current))
          setFailed(false)
        } catch (error) {
          failedPayload.current = next
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
    const timer = window.setTimeout(() => {
      void persistLatest().catch(() => setFailed(true))
    }, 220)
    return () => window.clearTimeout(timer)
  }, [persistLatest, workspace])

  useEffect(
    () =>
      window.scourgify.onBeforeWorkspaceClose(async () => {
        await persistLatest()
        await window.scourgify.flushWorkspace()
      }),
    [persistLatest],
  )

  return failed
}
