import { describe, expect, it, vi } from "vitest"
import { createPdfFindRuntime, type PdfFindState } from "../../src/renderer/lib/pdfFindRuntime"

type Listener = (data: Record<string, unknown>) => void

/** The slice of PDF.js's event bus the runtime talks to. */
function fakeBus() {
  const listeners = new Map<string, Set<Listener>>()
  const dispatched: { name: string; data: Record<string, unknown> }[] = []
  return {
    dispatched,
    on: (name: string, listener: Listener) => {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener))
    },
    off: (name: string, listener: Listener) => {
      listeners.get(name)?.delete(listener)
    },
    dispatch: (name: string, data: Record<string, unknown>) => {
      dispatched.push({ name, data })
      for (const listener of listeners.get(name) ?? []) listener(data)
    },
  }
}

const FOUND = 0
const NOT_FOUND = 1
const WRAPPED = 2
const PENDING = 3

describe("pdf find runtime", () => {
  it("asks PDF.js for every match of the typed text and reports where the selection is", () => {
    const bus = fakeBus()
    const { runtime } = createPdfFindRuntime(bus)
    const states: PdfFindState[] = []
    runtime.subscribe((state) => states.push(state))

    runtime.find("multi-resolution")
    expect(bus.dispatched.at(-1)).toMatchObject({
      name: "find",
      data: { type: "", query: "multi-resolution", highlightAll: true, findPrevious: false },
    })
    expect(states.at(-1)).toMatchObject({ query: "multi-resolution", status: "pending" })

    bus.dispatch("updatefindcontrolstate", {
      state: FOUND,
      previous: false,
      matchesCount: { current: 1, total: 17 },
    })
    expect(runtime.state()).toEqual({
      query: "multi-resolution",
      status: "found",
      current: 1,
      total: 17,
    })

    runtime.next()
    expect(bus.dispatched.at(-1)).toMatchObject({
      name: "find",
      data: { type: "again", findPrevious: false },
    })
    bus.dispatch("updatefindmatchescount", { matchesCount: { current: 2, total: 17 } })
    expect(runtime.state().current).toBe(2)

    runtime.previous()
    expect(bus.dispatched.at(-1)).toMatchObject({
      name: "find",
      data: { type: "again", findPrevious: true },
    })
    bus.dispatch("updatefindcontrolstate", {
      state: WRAPPED,
      previous: true,
      matchesCount: { current: 17, total: 17 },
    })
    expect(runtime.state()).toMatchObject({ status: "wrapped", current: 17 })
  })

  it("tells when nothing matches, and while PDF.js is still looking", () => {
    const bus = fakeBus()
    const { runtime } = createPdfFindRuntime(bus)
    runtime.find("zzzz")
    bus.dispatch("updatefindcontrolstate", {
      state: PENDING,
      previous: false,
      matchesCount: { current: 0, total: 0 },
    })
    expect(runtime.state().status).toBe("pending")
    bus.dispatch("updatefindcontrolstate", {
      state: NOT_FOUND,
      previous: false,
      matchesCount: { current: 0, total: 0 },
    })
    expect(runtime.state()).toMatchObject({ status: "notFound", total: 0 })
  })

  it("closing, or clearing the text, takes the marks off the pages and forgets the search", () => {
    const bus = fakeBus()
    const { runtime } = createPdfFindRuntime(bus)
    runtime.find("lactate")
    runtime.close()
    expect(bus.dispatched.at(-1)?.name).toBe("findbarclose")
    expect(runtime.state()).toEqual({ query: "", status: "idle", current: 0, total: 0 })
    // A late report from PDF.js about the closed search changes nothing.
    bus.dispatch("updatefindcontrolstate", {
      state: FOUND,
      previous: false,
      matchesCount: { current: 3, total: 9 },
    })
    expect(runtime.state().status).toBe("idle")
    // Stepping with no search open asks PDF.js for nothing.
    const before = bus.dispatched.length
    runtime.next()
    runtime.previous()
    expect(bus.dispatched.length).toBe(before)

    runtime.find("map")
    runtime.find("")
    expect(bus.dispatched.at(-1)?.name).toBe("findbarclose")
    expect(runtime.state().status).toBe("idle")
  })

  it("stops listening to the bus once disposed", () => {
    const bus = fakeBus()
    const { runtime, dispose } = createPdfFindRuntime(bus)
    const listener = vi.fn()
    runtime.subscribe(listener)
    runtime.find("x")
    dispose()
    bus.dispatch("updatefindcontrolstate", {
      state: FOUND,
      previous: false,
      matchesCount: { current: 1, total: 1 },
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
