import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FeatureTips, TipsGallery } from "../../src/web/tips/FeatureTips"
import { FEATURE_TIPS, nextTip, readTipState } from "../../src/web/tips/tipCatalog"

function anchorWith(className: string): HTMLElement {
  const element = document.createElement("button")
  element.className = className
  element.getBoundingClientRect = () =>
    ({ left: 100, top: 40, right: 200, bottom: 72, width: 100, height: 32 }) as DOMRect
  document.body.append(element)
  return element
}

describe("feature tips", () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    })
    document.body.innerHTML = ""
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("picks the first unseen tip whose control is on screen", () => {
    const always = (): Element => document.body
    expect(nextTip("reader", true, { seen: [], off: false }, always)?.id).toBe("select")
    expect(nextTip("reader", true, { seen: ["select"], off: false }, always)?.id).toBe(
      "page-translation",
    )
    expect(nextTip("reader", false, { seen: [], off: false }, always)).toBeNull()
    expect(nextTip("reader", true, { seen: [], off: true }, always)).toBeNull()
    expect(nextTip("library", false, { seen: [], off: false }, () => null)).toBeNull()
  })

  it("shows one tip beside its control and remembers the dismissal", () => {
    vi.useFakeTimers()
    anchorWith("library-import-button")
    const { unmount } = render(<FeatureTips view="library" hasDocument={false} visitKey="a" />)

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole("dialog", { name: "PDF 가져오기" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "알겠어요" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(readTipState().seen).toContain("import")
    unmount()

    render(<FeatureTips view="library" hasDocument={false} visitKey="b" />)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("turns every tip off from any tip", () => {
    vi.useFakeTimers()
    anchorWith("library-import-button")
    render(<FeatureTips view="library" hasDocument={false} visitKey="a" />)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    fireEvent.click(screen.getByRole("button", { name: "팁 끄기" }))
    expect(readTipState().off).toBe(true)
  })

  it("lists every tip in the 사용법 gallery and can show them again", () => {
    window.localStorage.setItem(
      "ohmypaper:feature-tips:v1",
      JSON.stringify({ seen: ["import"], off: true }),
    )
    render(<TipsGallery onClose={vi.fn()} />)

    for (const tip of FEATURE_TIPS) {
      expect(screen.getByRole("heading", { name: tip.title })).toBeVisible()
    }
    fireEvent.click(screen.getByRole("button", { name: "팁 다시 보기" }))
    expect(readTipState()).toEqual({ seen: [], off: false })
  })
})
