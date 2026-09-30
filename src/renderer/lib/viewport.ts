import type { Point, Viewport } from "../../shared/schemas"

export type VisiblePageRect = {
  readonly page: number
  readonly top: number
  readonly bottom: number
}

export function clampZoom(value: number): number {
  return Math.min(4, Math.max(0.38, value))
}

export function panViewport(viewport: Viewport, delta: Point): Viewport {
  return {
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
    zoom: viewport.zoom,
  }
}

/** A trackpad stroke locks to one axis only when that axis clearly dominates it. */
const AXIS_LOCK_RATIO = 2
/** A clearly perpendicular stroke switches a lock left over from the previous gesture. */
const AXIS_SWITCH_RATIO = 3

export function nextWheelAxis(current: "x" | "y" | null, delta: Point): "x" | "y" | null {
  const horizontal = Math.abs(delta.x)
  const vertical = Math.abs(delta.y)
  if (current === "y") return horizontal > vertical * AXIS_SWITCH_RATIO ? "x" : "y"
  if (current === "x") return vertical > horizontal * AXIS_SWITCH_RATIO ? "y" : "x"
  if (vertical > 0 && vertical >= horizontal * AXIS_LOCK_RATIO) return "y"
  if (horizontal > 0 && horizontal >= vertical * AXIS_LOCK_RATIO) return "x"
  return null
}

export function wheelPanDelta(delta: Point, shiftKey: boolean): Point {
  if (shiftKey) return { x: -(delta.y || delta.x), y: 0 }
  const axis = nextWheelAxis(null, delta)
  if (axis === "y") return { x: 0, y: -delta.y }
  if (axis === "x") return { x: -delta.x, y: 0 }
  return { x: -delta.x, y: -delta.y }
}

export function mostVisiblePage(
  boardTop: number,
  boardBottom: number,
  pages: readonly VisiblePageRect[],
): number | null {
  let bestPage: number | null = null
  let bestOverlap = 0
  for (const page of pages) {
    const overlap = Math.max(0, Math.min(boardBottom, page.bottom) - Math.max(boardTop, page.top))
    if (overlap > bestOverlap) {
      bestPage = page.page
      bestOverlap = overlap
    }
  }
  return bestPage
}

export function moveWorldPointByScreenDelta(point: Point, delta: Point, zoom: number): Point {
  return { x: point.x + delta.x / zoom, y: point.y + delta.y / zoom }
}

export function revealWorldRectHorizontally(
  viewport: Viewport,
  availableWidth: number,
  rect: { readonly x: number; readonly width: number },
  padding: number,
): Viewport {
  const left = viewport.x + rect.x * viewport.zoom
  const right = viewport.x + (rect.x + rect.width) * viewport.zoom
  const shift = left < padding ? padding - left : Math.min(0, availableWidth - padding - right)
  return shift !== 0 ? { ...viewport, x: viewport.x + shift } : viewport
}

export function fitWorldRectHorizontally(
  viewport: Viewport,
  availableWidth: number,
  rect: { readonly x: number; readonly y: number; readonly width: number },
  padding: number,
): Viewport {
  const zoom = clampZoom(Math.min(viewport.zoom, (availableWidth - padding * 2) / rect.width))
  const currentTop = viewport.y + rect.y * viewport.zoom
  return {
    x: padding - rect.x * zoom,
    y: currentTop - rect.y * zoom,
    zoom,
  }
}

export function focusWorldRect(
  viewport: Viewport,
  available: { readonly width: number; readonly height: number },
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Viewport {
  return {
    ...viewport,
    x: available.width * 0.64 - (rect.x + rect.width / 2) * viewport.zoom,
    y: available.height * 0.12 - rect.y * viewport.zoom,
  }
}

export function focusSourceRect(
  viewport: Viewport,
  available: { readonly width: number; readonly height: number },
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Viewport {
  return {
    ...viewport,
    x: available.width / 2 - (rect.x + rect.width / 2) * viewport.zoom,
    y: available.height * 0.12 - rect.y * viewport.zoom,
  }
}

export function zoomViewportAt(viewport: Viewport, focalPoint: Point, zoom: number): Viewport {
  const nextZoom = clampZoom(zoom)
  const worldX = (focalPoint.x - viewport.x) / viewport.zoom
  const worldY = (focalPoint.y - viewport.y) / viewport.zoom
  return {
    x: focalPoint.x - worldX * nextZoom,
    y: focalPoint.y - worldY * nextZoom,
    zoom: nextZoom,
  }
}
