import { useEffect, useState } from "react"
import type { Workspace } from "../../shared/schemas"

export function useWorkspacePersistence(workspace: Workspace | null): boolean {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!workspace) return
    void window.scourgify
      .saveWorkspace(workspace)
      .then(() => setFailed(false))
      .catch(() => setFailed(true))
  }, [workspace])
  return failed
}
