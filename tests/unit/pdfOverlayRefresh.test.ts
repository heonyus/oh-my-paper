import { describe, expect, it } from "vitest"
import {
  needsOverlayRefresh,
  nextOverlayState,
  type PageViewContainer,
  pageOverlayStyle,
  syncViewerWidth,
} from "../../src/renderer/lib/pdfOverlayRefresh"

describe("PDF overlay refresh", () => {
  it("refreshes when the page element is new", () => {
    const page = document.createElement("div")
    Object.defineProperty(page, "getBoundingClientRect", {
      value: () => ({
        width: 800,
        height: 1000,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 1000,
        right: 800,
        toJSON: () => {},
      }),
    })

    expect(needsOverlayRefresh(undefined, page, false)).toBe(true)
  })

  it("refreshes when page CSS size changes after zoom", () => {
    const page = document.createElement("div")
    Object.defineProperty(page, "getBoundingClientRect", {
      value: () => ({
        width: 1200,
        height: 1500,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 1500,
        right: 1200,
        toJSON: () => {},
      }),
    })

    expect(needsOverlayRefresh({ page, width: 800, height: 1000 }, page, true)).toBe(true)
  })

  it("keeps an intact overlay when the page element and size are unchanged", () => {
    const page = document.createElement("div")
    Object.defineProperty(page, "getBoundingClientRect", {
      value: () => ({
        width: 800,
        height: 1000,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 1000,
        right: 800,
        toJSON: () => {},
      }),
    })

    expect(needsOverlayRefresh({ page, width: 800, height: 1000 }, page, true)).toBe(false)
  })

  it("keeps the previous overlay host when zoom empties the text layer", () => {
    const page = document.createElement("div")
    Object.defineProperty(page, "getBoundingClientRect", {
      value: () => ({
        width: 1200,
        height: 1500,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 1500,
        right: 1200,
        toJSON: () => {},
      }),
    })
    const previous = {
      structures: [
        {
          id: "figure-1",
          kind: "figure" as const,
          page: 1,
          title: "Figure 1 해설",
          quote: "Figure 1",
          bounds: { x: 100, y: 120, width: 240, height: 160 },
        },
      ],
      pageDiv: page,
      pageWidth: 800,
      pageHeight: 1000,
    }

    const next = nextOverlayState(previous, page, null)

    expect(next?.pageWidth).toBe(1200)
    expect(next?.pageHeight).toBe(1500)
    expect(next?.structures[0]?.bounds).toEqual({ x: 150, y: 180, width: 360, height: 240 })
  })

  it("calculates pageOverlayStyle relative to container", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({ left: 50, top: 100, width: 800, height: 2000 }),
    })
    const page = document.createElement("div")
    Object.defineProperty(page, "getBoundingClientRect", {
      value: () => ({ left: 50, top: 120, width: 700, height: 900 }),
    })

    const style = pageOverlayStyle(page, container)
    expect(style).toEqual({
      left: 0,
      top: 20,
      width: 700,
      height: 900,
    })

    expect(pageOverlayStyle(page, null)).toEqual({})
  })

  it("syncs viewer width from the first page element", () => {
    const container = document.createElement("div")
    const firstPage = document.createElement("div")
    Object.defineProperty(firstPage, "offsetWidth", { value: 850 })
    const viewer: PageViewContainer = {
      getPageView: (index: number) => (index === 0 ? { div: firstPage } : null),
    }

    syncViewerWidth(container, viewer)
    expect(container.style.width).toBe("850px")
  })
})
