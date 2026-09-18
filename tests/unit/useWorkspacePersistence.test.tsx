import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useWorkspacePersistence } from "../../src/renderer/lib/useWorkspacePersistence"
import { type Workspace, workspaceSchema } from "../../src/shared/schemas"

const workspace = workspaceSchema.parse({
  documents: [],
  cards: [],
  sidebarOpen: true,
  viewport: { x: 0, y: 0, zoom: 1 },
  activeDocumentId: null,
})

afterEach(() => vi.useRealTimers())

describe("useWorkspacePersistence", () => {
  it("coalesces rapid workspace changes into one latest save", async () => {
    vi.useFakeTimers()
    const saveWorkspace = vi.fn(async (value: Workspace) => value)
    const onAcknowledged = vi.fn()
    Object.defineProperty(window, "scourgify", {
      configurable: true,
      value: {
        saveWorkspace,
        onBeforeWorkspaceClose: () => () => {},
        flushWorkspace: async () => {},
      },
    })
    const { rerender } = renderHook(
      ({ x }: { readonly x: number }) =>
        useWorkspacePersistence(
          { ...workspace, viewport: { ...workspace.viewport, x } },
          onAcknowledged,
        ),
      { initialProps: { x: 0 } },
    )

    rerender({ x: 10 })
    rerender({ x: 20 })
    expect(saveWorkspace).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(250))

    expect(saveWorkspace).toHaveBeenCalledTimes(1)
    expect(saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ viewport: expect.objectContaining({ x: 20 }) }),
    )
  })
})
