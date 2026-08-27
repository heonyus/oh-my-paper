import type { Point, Viewport } from "../../shared/schemas"

export function clampZoom(value: number): number {
  return Math.min(1.5, Math.max(0.38, value))
}

export function panViewport(viewport: Viewport, delta: Point): Viewport {
  return {
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
    zoom: viewport.zoom,
  }
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
  const right = viewport.x + (rect.x + rect.width) * viewport.zoom
  const overflow = Math.max(0, right - (availableWidth - padding))
  return overflow > 0 ? { ...viewport, x: viewport.x - overflow } : viewport
}

export function focusWorldRect(
  viewport: Viewport,
  available: { readonly width: number; readonly height: number },
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Viewport {
  return {
    ...viewport,
    x: available.width * 0.64 - rect.x * viewport.zoom,
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
