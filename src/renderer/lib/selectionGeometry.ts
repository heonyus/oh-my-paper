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

/** The most rects a saved anchor keeps (sourceAnchorSchema). */
export const SOURCE_FRAGMENTS_MAX = 128

function union(a: SourceFragment, b: SourceFragment): SourceFragment {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/** Rects on one line that touch: most of the shorter one's height is shared, the gap is small. */
function sameLine(a: SourceFragment, b: SourceFragment): boolean {
  const shared = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (shared < Math.min(a.height, b.height) / 2) return false
  const gap = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width)
  return gap <= Math.max(a.height, b.height)
}

/**
 * One rect per line of a selection. The browser reports a rect for every text-layer span, and
 * the span's box besides, so a long passage easily passes what an anchor can save; a workspace
 * holding such a card could never be saved. Rects on one line are merged in the order they
 * first appear, and runs of lines are merged when even that is over `limit`.
 */
export function mergeSelectionFragments(
  fragments: readonly SourceFragment[],
  limit = SOURCE_FRAGMENTS_MAX,
): readonly SourceFragment[] {
  const lines: SourceFragment[] = []
  for (const fragment of fragments) {
    const index = lines.findIndex((line) => sameLine(line, fragment))
    if (index === -1) lines.push(fragment)
    else lines[index] = union(lines[index] as SourceFragment, fragment)
  }
  if (lines.length <= limit) return lines
  const run = Math.ceil(lines.length / limit)
  const merged: SourceFragment[] = []
  for (let start = 0; start < lines.length; start += run)
    merged.push(lines.slice(start, start + run).reduce(union))
  return merged
}
