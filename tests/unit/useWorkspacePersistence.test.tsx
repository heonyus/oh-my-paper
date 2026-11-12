import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useWorkspacePersistence } from "../../src/renderer/lib/useWorkspacePersistence"
import { documentRecordSchema, type Workspace, workspaceSchema } from "../../src/shared/schemas"

const workspace = workspaceSchema.parse({
  documents: [],
  cards: [],
  sidebarOpen: true,
  viewport: { x: 0, y: 0, zoom: 1 },
  activeDocumentId: null,
})

afterEach(() => vi.useRealTimers())

function paper(id: string) {
  return documentRecordSchema.parse({
    id,
    name: `${id}.pdf`,
    hash: id.padEnd(64, "0"),
    bytes: 1024,
    importedAt: "2026-08-27T00:00:00.000Z",
    pageCount: 3,
    title: id,
    authors: [],
    year: null,
    doi: null,
    quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
  })
}

describe("useWorkspacePersistence", () => {
  it("keeps this window on its own paper when a save returns the paper another window opened", async () => {
    vi.useFakeTimers()
    const mine = paper("aabbccddeeff0011")
    const theirs = paper("1122334455667788")
    const open = { ...workspace, documents: [mine, theirs], activeDocumentId: mine.id }
    // The backend answers every save with the other window's paper as the one open.
    const saveWorkspace = vi.fn(async (value: Workspace) => ({
      ...value,
      activeDocumentId: theirs.id,
    }))
    let acknowledged: Workspace | null = null
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: {
        saveWorkspace,
        onBeforeWorkspaceClose: () => () => {},
        flushWorkspace: async () => {},
      },
    })
    const { rerender } = renderHook(
      ({ value }: { readonly value: Workspace }) =>
        useWorkspacePersistence(value, (update) => {
          acknowledged = typeof update === "function" ? update(value) : update
        }),
      { initialProps: { value: open } },
    )
    const panned = { ...open, viewport: { ...open.viewport, x: 40 } }
    rerender({ value: panned })
    await act(async () => vi.advanceTimersByTimeAsync(250))

    expect(saveWorkspace).toHaveBeenCalled()
    expect(acknowledged).toMatchObject({ activeDocumentId: mine.id, viewport: { x: 40 } })
  })

  it("coalesces rapid workspace changes into one latest save", async () => {
    vi.useFakeTimers()
    const saveWorkspace = vi.fn(async (value: Workspace) => value)
    const onAcknowledged = vi.fn()
    Object.defineProperty(window, "ohmypaper", {
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

  it("retries an unchanged workspace after a temporary save failure", async () => {
    vi.useFakeTimers()
    const saveWorkspace = vi
      .fn<(value: Workspace) => Promise<Workspace>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockImplementation(async (value) => value)
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: {
        saveWorkspace,
        onBeforeWorkspaceClose: () => () => {},
        flushWorkspace: async () => {},
      },
    })

    const { result } = renderHook(() => useWorkspacePersistence(workspace, vi.fn()))

    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(result.current).toBe("temporary failure")
    expect(saveWorkspace).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(saveWorkspace).toHaveBeenCalledTimes(2)
    expect(result.current).toBeNull()
  })
})
