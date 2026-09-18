import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WebWorkspaceBridge } from "../../src/web/webWorkspace"

const sourceHash = "a".repeat(64)
const remoteDocument = {
  id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
  name: "paper.pdf",
  sourceHash,
  status: "ready",
  pageCount: 12,
  errorCode: null,
  createdAt: "2026-09-04T00:00:00.000Z",
}

describe("WebWorkspaceBridge", () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage)
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ documents: [remoteDocument] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it("maps private web documents into the shared board workspace and keeps UI preferences", async () => {
    const bridge = new WebWorkspaceBridge("user-1")
    const initial = await bridge.read()

    expect(initial.documents[0]).toMatchObject({
      id: sourceHash.slice(0, 16),
      title: "paper",
      pageCount: 12,
    })

    bridge.save({ ...initial, theme: "dark", uiFontScale: 1.5 })
    const restored = await bridge.read()
    expect(restored).toMatchObject({ theme: "dark", uiFontScale: 1.5 })
  })

  it("does not reconstruct ready documents as completed analysis tasks", async () => {
    const bridge = new WebWorkspaceBridge("user-1")

    expect(await bridge.analysis()).toEqual([])
  })
})
