import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useWorkspaceHistory } from "../../src/renderer/lib/useWorkspaceHistory"
import { workspaceSchema } from "../../src/shared/schemas"

const workspace = workspaceSchema.parse({
  documents: [],
  cards: [],
  sidebarOpen: true,
  viewport: { x: 0, y: 0, zoom: 1 },
  activeDocumentId: null,
})

describe("useWorkspaceHistory", () => {
  it("undoes and redoes workspace changes", () => {
    const { result } = renderHook(() => useWorkspaceHistory())
    act(() => result.current.resetWorkspace(workspace))
    act(() =>
      result.current.setWorkspace((current) =>
        current ? { ...current, viewport: { ...current.viewport, x: 40 } } : current,
      ),
    )

    expect(result.current.canUndo).toBe(true)
    act(() => result.current.undo())
    expect(result.current.workspace?.viewport.x).toBe(0)
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.redo())
    expect(result.current.workspace?.viewport.x).toBe(40)
  })
})
