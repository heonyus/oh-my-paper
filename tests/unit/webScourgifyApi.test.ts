import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  analysis: vi.fn(),
  importPicked: vi.fn(),
}))

vi.mock("../../src/web/webWorkspace", () => ({
  WebWorkspaceBridge: class {
    readonly analysis = mocks.analysis
    readonly importPicked = mocks.importPicked
  },
}))

async function installedApi() {
  const { installWebScourgifyApi } = await import("../../src/web/webScourgifyApi")
  installWebScourgifyApi("polling-test-user")
  return window.scourgify
}

describe("web analysis refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    mocks.analysis.mockReset()
    mocks.importPicked.mockReset()
    Object.defineProperty(document, "hidden", { configurable: true, value: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(document, "hidden")
  })

  it("does not poll after the initial snapshot when no analysis is active", async () => {
    mocks.analysis.mockResolvedValue([])
    const api = await installedApi()
    const unsubscribe = api.onDocumentAnalysis(vi.fn())

    expect(await api.readDocumentAnalysis()).toEqual([])
    await vi.advanceTimersByTimeAsync(10_000)

    expect(mocks.analysis).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it("restarts after upload and stops when the active analysis disappears", async () => {
    const queued = {
      id: "aaaaaaaaaaaaaaaa",
      title: "paper.pdf",
      pageCount: 12,
      completedPages: 0,
      state: "queued",
    }
    mocks.analysis
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([queued])
      .mockResolvedValueOnce([])
    mocks.importPicked.mockResolvedValue({ document: {}, duplicate: false })
    const api = await installedApi()
    const unsubscribe = api.onDocumentAnalysis(vi.fn())
    await api.readDocumentAnalysis()

    await api.importDocument()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(6_000)

    expect(mocks.analysis).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it("skips active analysis refreshes while the tab is hidden", async () => {
    const queued = {
      id: "aaaaaaaaaaaaaaaa",
      title: "paper.pdf",
      pageCount: 12,
      completedPages: 0,
      state: "queued",
    }
    mocks.analysis.mockResolvedValue([queued])
    const api = await installedApi()
    const unsubscribe = api.onDocumentAnalysis(vi.fn())
    await api.readDocumentAnalysis()
    Object.defineProperty(document, "hidden", { configurable: true, value: true })

    await vi.advanceTimersByTimeAsync(6_000)

    expect(mocks.analysis).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
