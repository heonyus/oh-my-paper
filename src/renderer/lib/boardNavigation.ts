import type { Point, Viewport } from "../../shared/schemas"

export type WorldRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type ViewportSize = { readonly width: number; readonly height: number }
export type ViewportConstraint = (viewport: Viewport) => Viewport
export type ScreenRect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function mergeWorldRects(rects: readonly WorldRect[]): WorldRect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function symmetricBoardBounds(
  pages: readonly WorldRect[],
  cards: readonly WorldRect[],
  minimumSideSpace: number,
): WorldRect | null {
  const paper = mergeWorldRects(pages)
  if (!paper) return mergeWorldRects(cards)
  const content = mergeWorldRects([...pages, ...cards]) ?? paper
  const paperRight = paper.x + paper.width
  const contentRight = content.x + content.width
  const sideSpace = Math.max(minimumSideSpace, paper.x - content.x, contentRight - paperRight)
  return {
    x: paper.x - sideSpace,
    y: content.y,
    width: paper.width + sideSpace * 2,
    height: content.height,
  }
}

export function hasCompletePageSet(pages: readonly WorldRect[], pageCount: number): boolean {
  return (
    pageCount > 0 &&
    pages.length >= pageCount &&
    pages.every((page) => page.width > 0 && page.height > 0)
  )
}

export function constrainViewportToBounds(
  viewport: Viewport,
  available: ViewportSize,
  bounds: WorldRect,
  padding: number,
): Viewport {
  const scaledWidth = bounds.width * viewport.zoom
  const scaledHeight = bounds.height * viewport.zoom
  const minimumX = available.width - padding - (bounds.x + bounds.width) * viewport.zoom
  const maximumX = padding - bounds.x * viewport.zoom
  const minimumY = available.height - padding - (bounds.y + bounds.height) * viewport.zoom
  const maximumY = padding - bounds.y * viewport.zoom
  const x =
    scaledWidth <= available.width - padding * 2
      ? (available.width - scaledWidth) / 2 - bounds.x * viewport.zoom
      : clamp(viewport.x, minimumX, maximumX)
  const y =
    scaledHeight <= available.height - padding * 2
      ? maximumY
      : clamp(viewport.y, minimumY, maximumY)
  return { x, y, zoom: viewport.zoom }
}

export function centerViewportOnWorldPoint(
  viewport: Viewport,
  available: ViewportSize,
  point: Point,
  bounds: WorldRect,
  padding: number,
): Viewport {
  return constrainViewportToBounds(
    {
      x: available.width / 2 - point.x * viewport.zoom,
      y: available.height / 2 - point.y * viewport.zoom,
      zoom: viewport.zoom,
    },
    available,
    bounds,
    padding,
  )
}

export function mapMinimapPointToWorld(
  point: Point,
  minimap: ScreenRect,
  bounds: WorldRect,
): Point {
  const horizontal = clamp((point.x - minimap.left) / minimap.width, 0, 1)
  const vertical = clamp((point.y - minimap.top) / minimap.height, 0, 1)
  return {
    x: bounds.x + bounds.width * horizontal,
    y: bounds.y + bounds.height * vertical,
  }
}

export function viewportWorldRect(viewport: Viewport, available: ViewportSize): WorldRect {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: available.width / viewport.zoom,
    height: available.height / viewport.zoom,
  }
}

export function intersectWorldRects(left: WorldRect, right: WorldRect): WorldRect | null {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const farX = Math.min(left.x + left.width, right.x + right.width)
  const farY = Math.min(left.y + left.height, right.y + right.height)
  return farX <= x || farY <= y ? null : { x, y, width: farX - x, height: farY - y }
}

export function worldRectToMinimap(rect: WorldRect, bounds: WorldRect): WorldRect {
  return {
    x: ((rect.x - bounds.x) / bounds.width) * 100,
    y: ((rect.y - bounds.y) / bounds.height) * 100,
    width: (rect.width / bounds.width) * 100,
    height: (rect.height / bounds.height) * 100,
  }
}
