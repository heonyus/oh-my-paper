/**
 * Which pages are on screen when the pages do not scroll inside their container but are carried
 * across the board by a CSS transform. PDF.js decides what to draw from its container's scroll
 * position, and the board's container never scrolls, so every page of a paper counted as
 * visible: all of them were drawn at full resolution, and a zoom step redrew them all in page
 * order while the page being read waited at the back of the queue.
 */

/** The part of the layout the reader can see, in the container's own (untransformed) pixels. */
export type VisibleBounds = {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
}

/** The page geometry PDF.js keeps: the page's box in its container's layout. */
export type LayoutPageView = {
  readonly id: number
  readonly div: {
    readonly offsetTop: number
    readonly offsetLeft: number
    readonly clientTop: number
    readonly clientLeft: number
    readonly clientWidth: number
    readonly clientHeight: number
  }
}

export type VisibleArea = {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** One visible page, in the shape PDF.js's `getVisibleElements` reports. */
export type VisiblePageView<V extends LayoutPageView> = {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly visibleArea: VisibleArea | null
  readonly view: V
  readonly percent: number
  readonly widthPercent: number
}

export type VisiblePages<V extends LayoutPageView> = {
  readonly first: VisiblePageView<V> | undefined
  readonly last: VisiblePageView<V> | undefined
  readonly views: readonly VisiblePageView<V>[]
  readonly ids: Set<number>
}

/**
 * The pages inside `bounds`, most visible first, as PDF.js's own visibility scan reports them
 * for a scrolling container: the same fields, the same partial-area box, so the rendering queue
 * and partial rendering need nothing else.
 */
export function visiblePageViews<V extends LayoutPageView>(
  views: readonly V[],
  bounds: VisibleBounds,
): VisiblePages<V> {
  const { top, bottom, left, right } = bounds
  const visible: VisiblePageView<V>[] = []
  const ids = new Set<number>()
  for (const view of views) {
    const element = view.div
    const x = element.offsetLeft + element.clientLeft
    const y = element.offsetTop + element.clientTop
    const width = element.clientWidth
    const height = element.clientHeight
    if (width <= 0 || height <= 0) continue
    const viewRight = x + width
    const viewBottom = y + height
    if (viewBottom <= top || y >= bottom || viewRight <= left || x >= right) continue
    const minY = Math.max(0, top - y)
    const minX = Math.max(0, left - x)
    const hiddenHeight = minY + Math.max(0, viewBottom - bottom)
    const hiddenWidth = minX + Math.max(0, viewRight - right)
    const fractionHeight = (height - hiddenHeight) / height
    const fractionWidth = (width - hiddenWidth) / width
    const percent = (fractionHeight * fractionWidth * 100) | 0
    visible.push({
      id: view.id,
      x,
      y,
      visibleArea:
        percent === 100
          ? null
          : {
              minX,
              minY,
              maxX: Math.min(viewRight, right) - x,
              maxY: Math.min(viewBottom, bottom) - y,
            },
      view,
      percent,
      widthPercent: (fractionWidth * 100) | 0,
    })
    ids.add(view.id)
  }
  const first = visible[0]
  const last = visible.at(-1)
  visible.sort((a, b) => {
    const byVisibility = a.percent - b.percent
    if (Math.abs(byVisibility) > 0.001) return -byVisibility
    return a.id - b.id
  })
  return { first, last, views: visible, ids }
}

type Box = Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width" | "height">

/**
 * Maps the screen box the reader sees through (`window`) into the container's layout pixels, by
 * where the container's own box (`container`) landed on screen and how far it was scaled to get
 * there. `layoutWidth` and `layoutHeight` are the container's untransformed size.
 */
export function layoutBoundsWithin(
  window: Box,
  container: Box,
  layoutWidth: number,
  layoutHeight: number,
): VisibleBounds | null {
  if (layoutWidth <= 0 || layoutHeight <= 0 || container.width <= 0 || container.height <= 0)
    return null
  const scaleX = container.width / layoutWidth
  const scaleY = container.height / layoutHeight
  return {
    top: (window.top - container.top) / scaleY,
    bottom: (window.bottom - container.top) / scaleY,
    left: (window.left - container.left) / scaleX,
    right: (window.right - container.left) / scaleX,
  }
}

function clipsContent(overflow: string): boolean {
  return overflow !== "visible"
}

/** The nearest ancestor that clips its content: the box the pages are seen through. */
export function clippingAncestor(element: Element): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (clipsContent(style.overflowX) || clipsContent(style.overflowY)) return parent
  }
  return null
}

/** The visible layout bounds of `container` as seen through `host`, or null when unmeasurable. */
export function visibleBoundsThrough(host: Element, container: HTMLElement): VisibleBounds | null {
  return layoutBoundsWithin(
    host.getBoundingClientRect(),
    container.getBoundingClientRect(),
    container.offsetWidth,
    container.offsetHeight,
  )
}
