import type { PageTranslationBlock } from "./pageTranslationSource"

/** A rectangle as fractions of the page width and height. */
export type PageFraction = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** How the source paragraph is set, in percent of the page width where it is a length. */
export type RegionTypography = {
  readonly fontSize: number
  /** Unitless, so the source line pitch survives any shrinking to fit. */
  readonly lineHeight: number
  readonly indent: number
  readonly hang: number
  readonly bullet: boolean
  /** Every line centred, as a title page's author list is. */
  readonly centered?: boolean
}

/** One source paragraph (or heading) whose translation is typeset in its place. */
export type LayoutRegion = {
  readonly id: string
  readonly blockIds: readonly string[]
  readonly kind: "heading" | "body"
  readonly rect: PageFraction
  readonly translation: string
  readonly typography?: RegionTypography
  /** The source is set in a serif face; unknown until the PDF's fonts are read. */
  readonly serif?: boolean
  /** The whole source paragraph is set in bold, as an abstract may be. */
  readonly bold?: boolean
  /** The whole source paragraph is set in italic, as an affiliation may be. */
  readonly italic?: boolean
  /** The source's type size in percent of the page width, once the PDF's fonts are read. */
  readonly size?: number
  /** What to paint over on the page copy when it reaches past `rect`: the source's glyphs. */
  readonly mask?: PageFraction
}

/** Kept as original pixels: rewriting them would lose information. */
const preservedStructures = new Set(["equation", "table", "figure"])

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function pageFraction(block: PageTranslationBlock): PageFraction | null {
  const bounds = block.sourceBounds
  const width = block.sourcePageWidth
  const height = block.sourcePageHeight
  if (!bounds || !width || !height) return null
  const x = clampFraction(bounds.x / width)
  const y = clampFraction(bounds.y / height)
  const fractionWidth = Math.min(bounds.width / width, 1 - x)
  const fractionHeight = Math.min(bounds.height / height, 1 - y)
  if (fractionWidth <= 0 || fractionHeight <= 0) return null
  return { x, y, width: fractionWidth, height: fractionHeight }
}

function headingText(translation: string): string {
  return translation.replace(/^#{1,6}\s+/u, "")
}

/**
 * Groups sentence translations back into the source paragraph they were cut from, so each
 * paragraph's translation can be set inside that paragraph's box on the page.
 */
export function layoutRegions(blocks: readonly PageTranslationBlock[]): readonly LayoutRegion[] {
  const groups = new Map<string, PageTranslationBlock[]>()
  for (const block of blocks) {
    if (block.structureKind && preservedStructures.has(block.structureKind)) continue
    const key = block.parsedBlockId ?? block.id
    const group = groups.get(key)
    if (group) group.push(block)
    else groups.set(key, [block])
  }
  return [...groups].flatMap(([id, members]) => {
    const first = members[0]
    const rect = first ? pageFraction(first) : null
    if (!first || !rect) return []
    const kind = first.kind
    const translation = members
      .map((member) => member.translation.trim())
      .filter((text) => text.length > 0)
      .map((text) => (kind === "heading" ? headingText(text) : text))
      .join(" ")
    return [{ id, blockIds: members.map((member) => member.id), kind, rect, translation }]
  })
}

function overlapsHorizontally(left: PageFraction, right: PageFraction): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width
}

function sameColumn(left: PageFraction, right: PageFraction): boolean {
  const overlap = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
  return overlap >= Math.min(left.width, right.width) * 0.5
}

/**
 * Consecutive paragraphs reading down one column with nothing between them — no heading,
 * figure or equation, no change of type size (a caption after body text), and no more than
 * `maxGap` of the page apart. Each run is typeset as one flow.
 */
export function columnRuns(
  regions: readonly LayoutRegion[],
  obstacles: readonly PageFraction[],
  maxGap = 0.03,
): readonly (readonly LayoutRegion[])[] {
  const runs: LayoutRegion[][] = []
  for (const region of regions) {
    const run = runs.at(-1)
    const previous = run?.at(-1)
    const bottom = previous ? previous.rect.y + previous.rect.height : 0
    const between = (other: PageFraction): boolean => {
      const middle = other.y + other.height / 2
      return overlapsHorizontally(other, region.rect) && middle > bottom && middle < region.rect.y
    }
    const previousSize = previous?.typography?.fontSize
    const size = region.typography?.fontSize
    // Type of another size or face — italic affiliations over a serif abstract — is set apart.
    const sameType =
      (previousSize === undefined ||
        size === undefined ||
        Math.abs(previousSize - size) <= Math.max(previousSize, size) * 0.1) &&
      Boolean(previous?.italic) === Boolean(region.italic) &&
      (previous?.serif === undefined ||
        region.serif === undefined ||
        previous.serif === region.serif)
    if (
      run &&
      previous &&
      sameType &&
      sameColumn(previous.rect, region.rect) &&
      region.rect.y >= bottom - maxGap / 3 &&
      region.rect.y - bottom <= maxGap &&
      !obstacles.some(between)
    )
      run.push(region)
    else runs.push([region])
  }
  return runs
}

/** Lowest page fraction a region may grow to before touching what sits below it. */
export function regionBottomLimit(
  region: PageFraction,
  others: readonly PageFraction[],
  pageBottom = 0.96,
  gap = 0.004,
): number {
  const bottom = region.y + region.height
  const below = others
    .filter(
      (other) =>
        other !== region && other.y >= bottom - gap / 2 && overlapsHorizontally(region, other),
    )
    .map((other) => other.y - gap)
  return Math.max(bottom, Math.min(pageBottom, ...below))
}

/**
 * Largest size in [min, max] for which `fits` holds, found by bisection. When even `min`
 * does not fit, returns `min` with `fits: false`.
 */
export function fitFontSize(
  fits: (size: number) => boolean,
  max: number,
  min: number,
  steps = 7,
): { readonly size: number; readonly fits: boolean } {
  if (fits(max)) return { size: max, fits: true }
  if (!fits(min)) return { size: min, fits: false }
  let low = min
  let high = max
  for (let step = 0; step < steps; step += 1) {
    const middle = (low + high) / 2
    if (fits(middle)) low = middle
    else high = middle
  }
  fits(low)
  return { size: low, fits: true }
}

function median(values: number[]): number {
  values.sort((left, right) => left - right)
  return values[Math.floor(values.length / 2)] ?? 255
}

/** The paper colour around a region: per-channel median, so stray glyph pixels are ignored. */
export function backgroundColor(pixels: Uint8ClampedArray): string {
  const red: number[] = []
  const green: number[] = []
  const blue: number[] = []
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if ((pixels[index + 3] ?? 0) < 128) continue
    red.push(pixels[index] ?? 255)
    green.push(pixels[index + 1] ?? 255)
    blue.push(pixels[index + 2] ?? 255)
  }
  if (red.length === 0) return "rgb(255 255 255)"
  return `rgb(${median(red)} ${median(green)} ${median(blue)})`
}
