import { afterEach, describe, expect, it, vi } from "vitest"
import { InterchangePreviewStore } from "../../src/electron/interchangePreviewStore"

afterEach(() => vi.useRealTimers())

describe("main-owned import preview", () => {
  it("rejects forged, cross-window, reused and expired references", () => {
    vi.useFakeTimers()
    const store = new InterchangePreviewStore()
    const data = { records: [], errors: [], sensitiveKeysDetected: [], isValid: true }
    const id = store.create(1, { kind: "experiment", data })
    expect(() => store.take(2, id)).toThrow()
    expect(() => store.take(1, "forged")).toThrow()
    expect(store.take(1, id)).toEqual({ kind: "experiment", data })
    expect(() => store.take(1, id)).toThrow()
    const expired = store.create(1, { kind: "experiment", data })
    vi.advanceTimersByTime(300_001)
    expect(() => store.take(1, expired)).toThrow()
  })

  it("never commits invalid previews", () => {
    const store = new InterchangePreviewStore()
    const id = store.create(1, {
      kind: "experiment",
      data: { records: [], errors: [], sensitiveKeysDetected: ["patient"], isValid: false },
    })
    expect(() => store.take(1, id)).toThrow()
  })
})
