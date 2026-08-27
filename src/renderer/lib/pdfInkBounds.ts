export interface InkMask {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

export interface MaskRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface BottomAnchoredInkOptions {
  readonly maxGap: number
  readonly minRowInk: number
  readonly maxDistanceFromBottom: number
}

const BACKGROUND_MIN_CHANNEL = 250
const BACKGROUND_SPREAD = 6

function isBackground(r: number, g: number, b: number): boolean {
  return (
    Math.min(r, g, b) >= BACKGROUND_MIN_CHANNEL &&
    Math.max(r, g, b) - Math.min(r, g, b) < BACKGROUND_SPREAD
  )
}

function clampRange(value: number, max: number): number {
  return Math.max(0, Math.min(max, value))
}

export function buildInkMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  excluded: readonly MaskRect[],
): InkMask {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const red = rgba[index] ?? 255
      const green = rgba[index + 1] ?? 255
      const blue = rgba[index + 2] ?? 255
      if (!isBackground(red, green, blue)) data[y * width + x] = 1
    }
  }
  for (const rect of excluded) {
    const x0 = clampRange(Math.floor(rect.x), width)
    const y0 = clampRange(Math.floor(rect.y), height)
    const x1 = clampRange(Math.ceil(rect.x + rect.width), width)
    const y1 = clampRange(Math.ceil(rect.y + rect.height), height)
    for (let y = y0; y < y1; y += 1) {
      data.fill(0, y * width + x0, y * width + x1)
    }
  }
  return { data, width, height }
}

function unionRects(left: MaskRect, right: MaskRect): MaskRect {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const farRight = Math.max(left.x + left.width, right.x + right.width)
  const bottom = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: farRight - x, height: bottom - y }
}

export function inkUnionBounds(mask: InkMask, minArea: number): MaskRect | null {
  const { data, width, height } = mask
  const visited = new Uint8Array(data.length)
  const stack: number[] = []
  let union: MaskRect | null = null
  for (let start = 0; start < data.length; start += 1) {
    if (data[start] !== 1 || visited[start] === 1) continue
    stack.length = 0
    stack.push(start)
    visited[start] = 1
    let area = 0
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    while (stack.length > 0) {
      const index = stack.pop()
      if (index === undefined) break
      const x = index % width
      const y = (index - x) / width
      area += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (x > 0 && data[index - 1] === 1 && visited[index - 1] === 0) {
        visited[index - 1] = 1
        stack.push(index - 1)
      }
      if (x < width - 1 && data[index + 1] === 1 && visited[index + 1] === 0) {
        visited[index + 1] = 1
        stack.push(index + 1)
      }
      if (y > 0 && data[index - width] === 1 && visited[index - width] === 0) {
        visited[index - width] = 1
        stack.push(index - width)
      }
      if (y < height - 1 && data[index + width] === 1 && visited[index + width] === 0) {
        visited[index + width] = 1
        stack.push(index + width)
      }
    }
    if (area < minArea || maxX < minX) continue
    const component: MaskRect = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    }
    union = union === null ? component : unionRects(union, component)
  }
  return union
}

export function bottomAnchoredInkBounds(
  mask: InkMask,
  options: BottomAnchoredInkOptions,
): MaskRect | null {
  const rowInk = new Uint32Array(mask.height)
  for (let y = 0; y < mask.height; y += 1) {
    let count = 0
    for (let x = 0; x < mask.width; x += 1) count += mask.data[y * mask.width + x] ?? 0
    rowInk[y] = count
  }

  const bands: { start: number; end: number }[] = []
  let current: { start: number; end: number } | null = null
  for (let y = 0; y < rowInk.length; y += 1) {
    if ((rowInk[y] ?? 0) < options.minRowInk) continue
    if (current && y - current.end - 1 <= options.maxGap) current.end = y
    else {
      if (current) bands.push(current)
      current = { start: y, end: y }
    }
  }
  if (current) bands.push(current)
  let band: { start: number; end: number } | null = null
  for (let index = bands.length - 1; index >= 0; index -= 1) {
    const candidate = bands[index]
    if (!candidate) continue
    if (mask.height - candidate.end - 1 <= options.maxDistanceFromBottom) {
      band = candidate
      break
    }
  }
  if (!band) return null

  let minX = mask.width
  let maxX = -1
  for (let y = band.start; y <= band.end; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x] !== 1) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
    }
  }
  if (maxX < minX) return null
  return {
    x: minX,
    y: band.start,
    width: maxX - minX + 1,
    height: band.end - band.start + 1,
  }
}
