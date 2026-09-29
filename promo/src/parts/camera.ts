import type { RecordedEvent, RecordedScene } from "../timeline"

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Zoom toward the scene's focus shortly after it starts and back out before it ends. */
export function cameraAt(
  scene: RecordedScene,
  t: number,
  viewport: { readonly w: number; readonly h: number },
  maxZoom = 1.9,
): { readonly scale: number; readonly cx: number; readonly cy: number } {
  const focus = scene.focus
  if (!focus) return { scale: 1, cx: viewport.w / 2, cy: viewport.h / 2 }
  const target = Math.min(
    maxZoom,
    Math.max(1, 0.82 * Math.min(viewport.w / focus.w, viewport.h / focus.h)),
  )
  const zoomIn = scene.zoomIn === false ? 1 : smooth(scene.start + 0.25, scene.start + 1.15, t)
  const zoomOut = scene.zoomOut === false ? 1 : 1 - smooth(scene.end - 0.9, scene.end - 0.1, t)
  const amount = Math.min(zoomIn, zoomOut)
  return {
    scale: 1 + (target - 1) * amount,
    cx: viewport.w / 2 + (focus.x + focus.w / 2 - viewport.w / 2) * amount,
    cy: viewport.h / 2 + (focus.y + focus.h / 2 - viewport.h / 2) * amount,
  }
}

/** The pointer position at time t, interpolated between recorded samples. */
export function cursorAt(
  events: readonly RecordedEvent[],
  t: number,
): { readonly x: number; readonly y: number } | null {
  let previous: RecordedEvent | null = null
  for (const event of events) {
    if (event.x === undefined || event.y === undefined) continue
    if (event.t > t) {
      if (!previous || previous.x === undefined || previous.y === undefined)
        return { x: event.x, y: event.y }
      const span = event.t - previous.t
      const k = span <= 0 ? 1 : (t - previous.t) / span
      return {
        x: previous.x + (event.x - previous.x) * k,
        y: previous.y + (event.y - previous.y) * k,
      }
    }
    previous = event
  }
  return previous && previous.x !== undefined && previous.y !== undefined
    ? { x: previous.x, y: previous.y }
    : null
}
