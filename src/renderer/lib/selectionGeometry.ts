import type { Point, SourceFragment, Viewport } from "../../shared/schemas"

export type ScreenRect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export function rectsToElementSpace(
  rects: readonly ScreenRect[],
  renderedBounds: ScreenRect,
  layoutSize: { readonly width: number; readonly height: number },
): readonly SourceFragment[] {
  const scaleX = renderedBounds.width / layoutSize.width
  const scaleY = renderedBounds.height / layoutSize.height
  if (scaleX <= 0 || scaleY <= 0) return []
  return rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      x: (rect.left - renderedBounds.left) / scaleX,
      y: (rect.top - renderedBounds.top) / scaleY,
      width: rect.width / scaleX,
      height: rect.height / scaleY,
    }))
}

export function worldRectToScreen(
  fragment: SourceFragment,
  boardOrigin: Point,
  viewport: Viewport,
): ScreenRect {
  return {
    left: boardOrigin.x + viewport.x + fragment.x * viewport.zoom,
    top: boardOrigin.y + viewport.y + fragment.y * viewport.zoom,
    width: fragment.width * viewport.zoom,
    height: fragment.height * viewport.zoom,
  }
}
