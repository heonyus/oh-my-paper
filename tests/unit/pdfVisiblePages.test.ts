import { describe, expect, it } from "vitest"
import { layoutBoundsWithin, visiblePageViews } from "../../src/renderer/lib/pdfVisiblePages"

/** Pages of one size stacked down the container, like PDF.js lays a paper out. */
function stackedPages(count: number, width = 600, height = 800, gap = 16) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    div: {
      offsetTop: index * (height + gap),
      offsetLeft: 0,
      clientTop: 0,
      clientLeft: 0,
      clientWidth: width,
      clientHeight: height,
    },
  }))
}

describe("visiblePageViews", () => {
  it("reports only the pages inside the bounds, the most visible first", () => {
    const pages = stackedPages(28)
    // Page 10 spans 7344..8144; the window shows its lower half and the top of page 11.
    const visible = visiblePageViews(pages, { top: 7744, bottom: 8500, left: 0, right: 600 })
    expect([...visible.ids]).toEqual([10, 11])
    expect(visible.views.map((view) => view.id)).toEqual([10, 11])
    expect(visible.first?.id).toBe(10)
    expect(visible.last?.id).toBe(11)
    expect(visible.views[0]?.percent).toBe(50)
  })

  it("marks a fully visible page with no partial area and a clipped page with its visible box", () => {
    const pages = stackedPages(3)
    const visible = visiblePageViews(pages, { top: 0, bottom: 1000, left: 0, right: 600 })
    expect(visible.views.map((view) => [view.id, view.percent])).toEqual([
      [1, 100],
      [2, 23],
    ])
    expect(visible.views[0]?.visibleArea).toBeNull()
    expect(visible.views[1]?.visibleArea).toEqual({ minX: 0, minY: 0, maxX: 600, maxY: 184 })
  })

  it("orders two pages of equal visibility by page number", () => {
    const pages = stackedPages(4)
    // Page 2 is 816..1616 and page 3 is 1632..2432; the window straddles both evenly.
    const visible = visiblePageViews(pages, { top: 1216, bottom: 2032, left: 0, right: 600 })
    expect(visible.views.map((view) => view.id)).toEqual([2, 3])
  })

  it("reports no page when the window is between pages or off to the side", () => {
    const pages = stackedPages(2)
    expect(visiblePageViews(pages, { top: 802, bottom: 814, left: 0, right: 600 }).views).toEqual(
      [],
    )
    expect(visiblePageViews(pages, { top: 0, bottom: 800, left: 700, right: 900 }).views).toEqual(
      [],
    )
  })

  it("skips pages PDF.js has not sized yet", () => {
    const pages = stackedPages(2).map((page) =>
      page.id === 2 ? { ...page, div: { ...page.div, clientWidth: 0, clientHeight: 0 } } : page,
    )
    const visible = visiblePageViews(pages, { top: 0, bottom: 5000, left: 0, right: 600 })
    expect([...visible.ids]).toEqual([1])
  })
})

describe("layoutBoundsWithin", () => {
  it("maps the screen window into container layout pixels through the container's transform", () => {
    // The container (816 x 100000 in layout) is drawn scaled 1.5x and panned up 3000px.
    const container = {
      top: -3000,
      left: 100,
      width: 1224,
      height: 150000,
      bottom: 147000,
      right: 1324,
    }
    const window = { top: 0, left: 0, width: 1400, height: 700, bottom: 700, right: 1400 }
    expect(layoutBoundsWithin(window, container, 816, 100000)).toEqual({
      top: 2000,
      bottom: 2000 + 700 / 1.5,
      left: -100 / 1.5,
      right: (1400 - 100) / 1.5,
    })
  })

  it("is null before the container has a size", () => {
    const box = { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }
    expect(layoutBoundsWithin(box, box, 0, 0)).toBeNull()
  })
})
