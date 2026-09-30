import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readTipState, writeTipState } from "../../src/web/tips/tipCatalog"
import { useWelcome } from "../../src/web/useWelcome"

function answer(seen: boolean): Response {
  return new Response(JSON.stringify({ seen }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

describe("useWelcome", () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is pending for a fresh folder, and finishing marks it seen and restarts the tips", async () => {
    const fetchMock = vi.fn(async (_url: string) => answer(false))
    vi.stubGlobal("fetch", fetchMock)
    writeTipState({ seen: ["import", "translate"], off: true })

    const { result } = renderHook(() => useWelcome())
    expect(result.current.state).toBe("loading")
    await waitFor(() => expect(result.current.state).toBe("pending"))

    fetchMock.mockImplementation(async () => answer(true))
    act(() => result.current.finish())

    expect(result.current.state).toBe("seen")
    expect(readTipState()).toEqual({ seen: [], off: false })
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/rpc/markWelcomeSeen", expect.anything()),
    )
  })

  it("never blocks the app when the local server cannot answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )
    const { result } = renderHook(() => useWelcome())
    await waitFor(() => expect(result.current.state).toBe("seen"))
  })
})
