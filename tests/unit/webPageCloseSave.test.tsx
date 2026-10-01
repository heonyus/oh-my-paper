import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useWorkspacePersistence } from "../../src/renderer/lib/useWorkspacePersistence"
import { sha256Schema, type Workspace, workspaceSchema } from "../../src/shared/schemas"
import { workspacePatchRequestSchema } from "../../src/shared/workspacePatch"
import { saveLocalWorkspacePatch } from "../../src/web/localWorkspacePatch"
import { onPageClose } from "../../src/web/pageClose"

const token = sha256Schema.parse("a".repeat(64))
const workspace = workspaceSchema.parse({
  documents: [],
  cards: [],
  sidebarOpen: true,
  viewport: { x: 0, y: 0, zoom: 1 },
  activeDocumentId: null,
  snapshotToken: token,
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("web runtime page close", () => {
  it("sends a change still waiting for its save as a keepalive patch on pagehide", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(
      async (_url: string, _init: RequestInit) => new Response("", { status: 404 }),
    )
    vi.stubGlobal("fetch", fetch)
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: {
        saveWorkspace: vi.fn(async (value: Workspace) => value),
        saveWorkspacePatch: saveLocalWorkspacePatch,
        onBeforeWorkspaceClose: onPageClose,
        flushWorkspace: async () => {},
      },
    })
    const { rerender } = renderHook(
      ({ open }: { readonly open: boolean }) =>
        useWorkspacePersistence({ ...workspace, sidebarOpen: open }, vi.fn()),
      { initialProps: { open: true } },
    )
    await act(async () => vi.advanceTimersByTimeAsync(250))

    rerender({ open: false })
    window.dispatchEvent(new Event("pagehide"))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("/api/workspace/patch")
    expect(init?.keepalive).toBe(true)
    expect(workspacePatchRequestSchema.parse(JSON.parse(String(init?.body)))).toEqual({
      baseSnapshotToken: token,
      patch: { settings: { set: { sidebarOpen: false } } },
    })
  })
})
