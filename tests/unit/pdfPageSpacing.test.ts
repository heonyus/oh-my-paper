import { describe, expect, it } from "vitest"
import { keepPageSpacing, pageGap } from "../../src/renderer/lib/pdfPageSpacing"

function pageView(renderedHeight: number, exactHeight: number) {
  const div = document.createElement("div")
  Object.defineProperty(div, "offsetHeight", { value: renderedHeight })
  return { div, viewport: { height: exactHeight } }
}

describe("page spacing on the board", () => {
  it("gives each page the gap at this zoom plus what rounding took off its height", () => {
    const views = [pageView(1329, 1329.74), pageView(1329, 1329.74), pageView(1330, 1330.2)]
    keepPageSpacing({ getPageView: (index) => views[index] }, 1.26)

    const margins = views.map((view) => Number.parseFloat(view.div.style.marginBottom))
    expect(margins[0]).toBeCloseTo(pageGap * 1.26 + 0.74, 6)
    expect(margins[1]).toBeCloseTo(pageGap * 1.26 + 0.74, 6)
    expect(margins[2]).toBeCloseTo(pageGap * 1.26 + 0.2, 6)
  })

  it("so a page's world position is the same at every zoom", () => {
    const worldTop = (zoom: number): number => {
      const rendered = Math.floor(1054.5 * zoom)
      const views = Array.from({ length: 10 }, () => pageView(rendered, 1054.5 * zoom))
      keepPageSpacing({ getPageView: (index) => views[index] }, zoom)
      const screenTop = views
        .slice(0, 9)
        .reduce((top, view) => top + rendered + Number.parseFloat(view.div.style.marginBottom), 0)
      return screenTop / zoom
    }
    expect(worldTop(0.8)).toBeCloseTo(worldTop(1.26), 6)
    expect(worldTop(1.26)).toBeCloseTo(9 * (1054.5 + pageGap), 6)
  })

  it("skips pages PDF.js has not laid out", () => {
    const empty = pageView(0, 1000)
    keepPageSpacing({ getPageView: (index) => (index === 0 ? empty : undefined) }, 1)
    expect(empty.div.style.marginBottom).toBe("")
  })
})
