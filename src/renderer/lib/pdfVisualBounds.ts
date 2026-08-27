export interface BoundingBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface VisualComponent {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly type?: "canvas" | "image" | "vector" | "table_grid"
}

export interface ConnectedVisualBoundsOptions {
  readonly searchDirection?: "above" | "below" | "both"
  readonly maxDistance?: number
  readonly minComponentArea?: number
  readonly pageWidth?: number
  readonly pageHeight?: number
}

function doBoxesOverlapOrTouch(a: BoundingBox, b: BoundingBox, tolerance = 30): boolean {
  const horizontal = a.x - tolerance <= b.x + b.width && a.x + a.width + tolerance >= b.x
  const vertical = a.y - tolerance <= b.y + b.height && a.y + a.height + tolerance >= b.y
  return horizontal && vertical
}

function isPageBackground(comp: VisualComponent, width?: number, height?: number): boolean {
  return width !== undefined && height !== undefined
    ? comp.width >= width * 0.98 && comp.height >= height * 0.95
    : false
}

export function computeConnectedVisualBounds(
  captionBox: BoundingBox,
  components: readonly VisualComponent[],
  options?: ConnectedVisualBoundsOptions,
): BoundingBox | null {
  const direction = options?.searchDirection ?? "above"
  const maxDist = options?.maxDistance ?? 450
  const minArea = options?.minComponentArea ?? 20
  const valid = components.filter(
    (c) =>
      c.width > 0 &&
      c.height > 0 &&
      c.width * c.height >= minArea &&
      !isPageBackground(c, options?.pageWidth, options?.pageHeight),
  )
  if (valid.length === 0) return null

  const candidates = valid.filter((c) => {
    const bottom = c.y + c.height
    const capBottom = captionBox.y + captionBox.height
    if (direction === "above") {
      const dist = captionBox.y - bottom
      return dist >= -15 && c.y < captionBox.y && dist <= maxDist
    }
    if (direction === "below") {
      const dist = c.y - capBottom
      return dist >= -15 && bottom > capBottom && dist <= maxDist
    }
    return Math.abs(c.y + c.height / 2 - (captionBox.y + captionBox.height / 2)) <= maxDist
  })
  if (candidates.length === 0) return null

  const seed = [...candidates].sort((a, b) => {
    if (direction === "above") {
      return Math.abs(captionBox.y - (a.y + a.height)) - Math.abs(captionBox.y - (b.y + b.height))
    }
    const capBottom = captionBox.y + captionBox.height
    return Math.abs(a.y - capBottom) - Math.abs(b.y - capBottom)
  })[0]
  if (!seed) return null

  const grouped: VisualComponent[] = [seed]
  const remaining = candidates.filter((c) => c !== seed)
  let added = true
  while (added) {
    added = false
    for (let i = remaining.length - 1; i >= 0; i--) {
      const candidate = remaining[i]
      if (candidate && grouped.some((m) => doBoxesOverlapOrTouch(m, candidate, 60))) {
        grouped.push(candidate)
        remaining.splice(i, 1)
        added = true
      }
    }
  }

  const minX = Math.min(...grouped.map((c) => c.x))
  const minY = Math.min(...grouped.map((c) => c.y))
  const maxX = Math.max(...grouped.map((c) => c.x + c.width))
  let maxY = Math.max(...grouped.map((c) => c.y + c.height))
  let adjustedMinY = minY

  if (direction === "above" && maxY > captionBox.y) {
    maxY = Math.max(minY + 1, captionBox.y)
  } else if (direction === "below" && adjustedMinY < captionBox.y + captionBox.height) {
    adjustedMinY = Math.min(maxY - 1, captionBox.y + captionBox.height)
  }
  return { x: minX, y: adjustedMinY, width: maxX - minX, height: maxY - adjustedMinY }
}
