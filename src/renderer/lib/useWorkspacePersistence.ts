import { useCallback, useEffect, useRef, useState } from "react"
import type { Workspace } from "../../shared/schemas"

export function useWorkspacePersistence(workspace: Workspace | null): boolean {
  const [failed, setFailed] = useState(false)
  const latest = useRef<Workspace | null>(workspace)
  const saved = useRef<Workspace | null>(null)
  const saving = useRef(false)

  const persistLatest = useCallback(async (): Promise<void> => {
    if (saving.current) return
    const next = latest.current
    if (!next || next === saved.current) return
    saving.current = true
    try {
      await window.scourgify.saveWorkspace(next)
      saved.current = next
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      saving.current = false
      if (latest.current !== next) void persistLatest()
    }
  }, [])

  useEffect(() => {
    latest.current = workspace
    if (!workspace) return
    const timer = window.setTimeout(() => void persistLatest(), 220)
    return () => window.clearTimeout(timer)
  }, [persistLatest, workspace])
  return failed
}
