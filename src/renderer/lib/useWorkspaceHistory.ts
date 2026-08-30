import { useCallback, useReducer } from "react"
import type { Workspace } from "../../shared/schemas"

export type WorkspaceUpdate = Workspace | null | ((current: Workspace | null) => Workspace | null)
export type WorkspaceSetter = (update: WorkspaceUpdate) => void

type HistoryState = {
  readonly workspace: Workspace | null
  readonly past: readonly Workspace[]
  readonly future: readonly Workspace[]
}

type HistoryAction =
  | { readonly type: "update"; readonly update: WorkspaceUpdate }
  | { readonly type: "transient"; readonly update: WorkspaceUpdate }
  | { readonly type: "reset"; readonly workspace: Workspace }
  | { readonly type: "undo" }
  | { readonly type: "redo" }

function resolveUpdate(update: WorkspaceUpdate, current: Workspace | null): Workspace | null {
  return typeof update === "function" ? update(current) : update
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "reset") return { workspace: action.workspace, past: [], future: [] }
  if (action.type === "transient") {
    return { ...state, workspace: resolveUpdate(action.update, state.workspace) }
  }
  if (action.type === "update") {
    const next = resolveUpdate(action.update, state.workspace)
    if (next === state.workspace) return state
    return {
      workspace: next,
      past: state.workspace ? [...state.past.slice(-39), state.workspace] : state.past,
      future: [],
    }
  }
  if (action.type === "undo") {
    const previous = state.past.at(-1)
    if (!state.workspace || !previous) return state
    return {
      workspace: previous,
      past: state.past.slice(0, -1),
      future: [state.workspace, ...state.future.slice(0, 39)],
    }
  }
  const next = state.future[0]
  if (!state.workspace || !next) return state
  return {
    workspace: next,
    past: [...state.past.slice(-39), state.workspace],
    future: state.future.slice(1),
  }
}

export function useWorkspaceHistory(): {
  readonly workspace: Workspace | null
  readonly setWorkspace: WorkspaceSetter
  readonly setWorkspaceTransient: WorkspaceSetter
  readonly resetWorkspace: (workspace: Workspace) => void
  readonly undo: () => void
  readonly redo: () => void
  readonly canUndo: boolean
  readonly canRedo: boolean
} {
  const [state, dispatch] = useReducer(historyReducer, { workspace: null, past: [], future: [] })
  const setWorkspace = useCallback(
    (update: WorkspaceUpdate) => dispatch({ type: "update", update }),
    [],
  )
  const setWorkspaceTransient = useCallback(
    (update: WorkspaceUpdate) => dispatch({ type: "transient", update }),
    [],
  )
  const resetWorkspace = useCallback(
    (workspace: Workspace) => dispatch({ type: "reset", workspace }),
    [],
  )
  const undo = useCallback(() => dispatch({ type: "undo" }), [])
  const redo = useCallback(() => dispatch({ type: "redo" }), [])
  return {
    workspace: state.workspace,
    setWorkspace,
    setWorkspaceTransient,
    resetWorkspace,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
