import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DocumentFindBar } from "../../src/renderer/components/DocumentFindBar"
import {
  IDLE_FIND_STATE,
  type PdfFindRuntime,
  type PdfFindState,
} from "../../src/renderer/lib/pdfFindRuntime"

function fakeRuntime() {
  let state: PdfFindState = IDLE_FIND_STATE
  const listeners = new Set<(state: PdfFindState) => void>()
  const runtime: PdfFindRuntime = {
    find: vi.fn((query: string) => {
      state = { query, status: "pending", current: 0, total: 0 }
    }),
    next: vi.fn(),
    previous: vi.fn(),
    close: vi.fn(),
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    runtime,
    report: (next: Partial<PdfFindState>) => {
      state = { ...state, ...next }
      for (const listener of listeners) listener(state)
    },
  }
}

afterEach(cleanup)

describe("DocumentFindBar", () => {
  it("opens on ⌘F, finds as the reader types, and steps with Enter and ⇧Enter", async () => {
    const { runtime, report } = fakeRuntime()
    render(<DocumentFindBar runtime={runtime} />)
    expect(screen.queryByRole("search", { name: "문서에서 찾기" })).toBeNull()

    fireEvent.keyDown(window, { key: "f", metaKey: true })
    const bar = await screen.findByRole("search", { name: "문서에서 찾기" })
    const input = screen.getByRole("searchbox", { name: "찾을 글자" })
    await vi.waitFor(() => expect(input).toHaveFocus())

    await userEvent.type(input, "lactate")
    expect(runtime.find).toHaveBeenLastCalledWith("lactate")
    act(() => report({ status: "found", current: 1, total: 12 }))
    expect(bar).toHaveTextContent("1 / 12")

    await userEvent.keyboard("{Enter}")
    expect(runtime.next).toHaveBeenCalledTimes(1)
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}")
    expect(runtime.previous).toHaveBeenCalledTimes(1)

    act(() => report({ status: "notFound", current: 0, total: 0 }))
    expect(bar).toHaveTextContent("없음")
    expect(screen.getByRole("button", { name: "다음 결과" })).toBeDisabled()
  })

  it("leaves ⇧⌘F to the related-passage search", () => {
    const { runtime } = fakeRuntime()
    render(<DocumentFindBar runtime={runtime} />)
    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true })
    expect(screen.queryByRole("search", { name: "문서에서 찾기" })).toBeNull()
  })

  it("Esc closes the bar and clears the marks from the paper", async () => {
    const { runtime } = fakeRuntime()
    render(<DocumentFindBar runtime={runtime} />)
    fireEvent.keyDown(window, { key: "f", metaKey: true })
    await screen.findByRole("search", { name: "문서에서 찾기" })
    fireEvent.keyDown(window, { key: "Escape" })
    expect(runtime.close).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("search", { name: "문서에서 찾기" })).toBeNull()
  })

  it("runs the typed text once the paper's text becomes searchable", async () => {
    const { runtime } = fakeRuntime()
    const view = render(<DocumentFindBar runtime={null} />)
    fireEvent.keyDown(window, { key: "f", metaKey: true })
    const input = await screen.findByRole("searchbox", { name: "찾을 글자" })
    await vi.waitFor(() => expect(input).toHaveFocus())
    await userEvent.type(input, "map")
    expect(runtime.find).not.toHaveBeenCalled()
    view.rerender(<DocumentFindBar runtime={runtime} />)
    expect(runtime.find).toHaveBeenLastCalledWith("map")
  })
})
