import { useCallback, useRef, useState } from "react"
import type { Workspace } from "../../shared/schemas"

export type WorkspaceUpdate = Workspace | null | ((current: Workspace | null) => Workspace | null)
export type WorkspaceSetter = (update: WorkspaceUpdate) => void

export function useWorkspaceHistory(): {
  readonly workspace: Workspace | null
  readonly setWorkspace: WorkspaceSetter
  readonly resetWorkspace: (workspace: Workspace) => void
  readonly undo: () => void
  readonly redo: () => void
  readonly canUndo: boolean
  readonly canRedo: boolean
} {
  const [workspace, setCurrent] = useState<Workspace | null>(null)
  const past = useRef<Workspace[]>([])
  const future = useRef<Workspace[]>([])

  const setWorkspace = useCallback((update: WorkspaceUpdate): void => {
    setCurrent((current) => {
      const next = typeof update === "function" ? update(current) : update
      if (next === current) return current
      if (current) past.current = [...past.current.slice(-39), current]
      future.current = []
      return next
    })
  }, [])

  const resetWorkspace = useCallback((next: Workspace): void => {
    past.current = []
    future.current = []
    setCurrent(next)
  }, [])

  const undo = useCallback((): void => {
    setCurrent((current) => {
      const previous = past.current.at(-1)
      if (!current || !previous) return current
      past.current = past.current.slice(0, -1)
      future.current = [current, ...future.current.slice(0, 39)]
      return previous
    })
  }, [])

  const redo = useCallback((): void => {
    setCurrent((current) => {
      const next = future.current[0]
      if (!current || !next) return current
      future.current = future.current.slice(1)
      past.current = [...past.current.slice(-39), current]
      return next
    })
  }, [])

  return {
    workspace,
    setWorkspace,
    resetWorkspace,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
