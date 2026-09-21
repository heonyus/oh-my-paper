import type { BoundingBox, PdfTextSpan } from "./pdfFeatureDetection"
import { bottomAnchoredInkBounds, buildInkMask, inkUnionBounds } from "./pdfInkBounds"

const INK_PAD_PX = 3
const EQUATION_INK_PAD_PX = 5
const MIN_REGION_WIDTH = 12
const MIN_REGION_HEIGHT = 8

export function expandBoundsWithinPage(
  rect: BoundingBox,
  padding: number,
  pageWidth: number,
  pageHeight: number,
): BoundingBox {
  const x = Math.max(0, rect.x - padding)
  const y = Math.max(0, rect.y - padding)
  const right = Math.min(pageWidth, rect.x + rect.width + padding)
  const bottom = Math.min(pageHeight, rect.y + rect.height + padding)
  return { x, y, width: right - x, height: bottom - y }
}

export function hasPlausibleInkCoverage(
  candidate: BoundingBox,
  ink: BoundingBox,
  minimumWidthRatio = 0.45,
): boolean {
  return (
    ink.width >= candidate.width * minimumWidthRatio &&
    ink.height >= candidate.height * 0.45 &&
    ink.width * ink.height >= candidate.width * candidate.height * 0.18
  )
}

function canvasFor(pageElement: HTMLElement): HTMLCanvasElement | null {
  return pageElement.querySelector<HTMLCanvasElement>(".canvasWrapper canvas")
}

function canvasRectOf(
  region: BoundingBox,
  canvas: HTMLCanvasElement,
  pageRect: DOMRect,
): { x: number; y: number; width: number; height: number } | null {
  const scaleX = canvas.width / pageRect.width
  const scaleY = canvas.height / pageRect.height
  const x0 = Math.max(0, Math.floor(region.x * scaleX))
  const y0 = Math.max(0, Math.floor(region.y * scaleY))
  const x1 = Math.min(canvas.width, Math.ceil((region.x + region.width) * scaleX))
  const y1 = Math.min(canvas.height, Math.ceil((region.y + region.height) * scaleY))
  if (x1 - x0 < 2 || y1 - y0 < 2) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function captionInkSearchRegion(
  caption: BoundingBox,
  candidate: BoundingBox,
  pageWidth: number,
  pageHeight: number,
  kind: "figure" | "table",
): BoundingBox {
  if (kind === "table") {
    return expandBoundsWithinPage(candidate, INK_PAD_PX, pageWidth, pageHeight)
  }
  const horizontalPad =
    kind === "figure"
      ? Math.min(16, Math.max(4, candidate.width * 0.04))
      : Math.min(64, pageWidth * 0.05)
  const anchorLeft = Math.min(caption.x, candidate.x)
  const resolvedRight = Math.max(caption.x + caption.width, candidate.x + candidate.width)
  const x = Math.max(0, anchorLeft - horizontalPad)
  const right = Math.min(pageWidth, resolvedRight + horizontalPad)
  const bottom = Math.min(pageHeight, Math.max(1, caption.y - 2))
  const top = Math.max(0, Math.min(candidate.y, caption.y - pageHeight * 0.58))
  return { x, y: top, width: right - x, height: bottom - top }
}

export function inkBoundsForCaption(
  pageElement: HTMLElement,
  caption: BoundingBox,
  candidate: BoundingBox,
  kind: "figure" | "table",
): BoundingBox | null {
  const canvas = canvasFor(pageElement)
  if (!canvas) return null
  const pageRect = pageElement.getBoundingClientRect()
  const region = captionInkSearchRegion(caption, candidate, pageRect.width, pageRect.height, kind)
  const area = canvasRectOf(region, canvas, pageRect)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!area || !context) return null
  const image = context.getImageData(area.x, area.y, area.width, area.height)
  const mask = buildInkMask(image.data, area.width, area.height, [])
  const union =
    kind === "figure"
      ? (bottomAnchoredInkBounds(mask, {
          maxGap: Math.max(8, Math.round(area.height * 0.025)),
          minRowInk: Math.max(3, Math.round(area.width * 0.004)),
          maxDistanceFromBottom: Math.max(24, Math.round(area.height * 0.08)),
        }) ?? inkUnionBounds(mask, 10))
      : inkUnionBounds(mask, 10)
  if (!union) return null
  const scaleX = canvas.width / pageRect.width
  const scaleY = canvas.height / pageRect.height
  const inkX = Math.max(0, region.x + union.x / scaleX - INK_PAD_PX)
  const inkY = Math.max(0, region.y + union.y / scaleY - INK_PAD_PX)
  const inkRight = Math.min(
    pageRect.width,
    region.x + (union.x + union.width) / scaleX + INK_PAD_PX,
  )
  const inkBottom = Math.min(
    pageRect.height,
    region.y + (union.y + union.height) / scaleY + INK_PAD_PX,
  )
  return {
    x: inkX,
    y: inkY,
    width: Math.max(MIN_REGION_WIDTH, inkRight - inkX),
    height: Math.max(MIN_REGION_HEIGHT, inkBottom - inkY),
  }
}

export function tightestInkLineBounds(pageElement: HTMLElement, rect: BoundingBox): BoundingBox {
  const canvas = canvasFor(pageElement)
  if (!canvas) return rect
  const pageRect = pageElement.getBoundingClientRect()
  const area = canvasRectOf(rect, canvas, pageRect)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!area || !context) return rect
  const image = context.getImageData(area.x, area.y, area.width, area.height)
  const union = inkUnionBounds(buildInkMask(image.data, area.width, area.height, []), 1)
  if (!union) return rect
  const scaleX = canvas.width / pageRect.width
  const scaleY = canvas.height / pageRect.height
  const ink = {
    x: rect.x + union.x / scaleX,
    y: rect.y + union.y / scaleY,
    width: Math.max(MIN_REGION_WIDTH, union.width / scaleX),
    height: Math.max(MIN_REGION_HEIGHT, union.height / scaleY),
  }
  return expandBoundsWithinPage(ink, EQUATION_INK_PAD_PX, pageRect.width, pageRect.height)
}

const SPAN_TIGHTEN_MIN_AREA_RATIO = 0.35

export function tightenCandidateToSpans(
  candidate: BoundingBox,
  spans: readonly PdfTextSpan[],
): BoundingBox {
  const inside = spans.filter((span) => {
    const centerX = span.x + span.width / 2
    const centerY = span.y + span.height / 2
    return (
      centerX >= candidate.x &&
      centerX <= candidate.x + candidate.width &&
      centerY >= candidate.y &&
      centerY <= candidate.y + candidate.height
    )
  })
  if (inside.length === 0) return candidate
  const left = Math.min(...inside.map((span) => span.x))
  const top = Math.min(...inside.map((span) => span.y))
  const right = Math.max(...inside.map((span) => span.x + span.width))
  const bottom = Math.max(...inside.map((span) => span.y + span.height))
  const union: BoundingBox = { x: left, y: top, width: right - left, height: bottom - top }
  const candidateArea = candidate.width * candidate.height
  const unionArea = union.width * union.height
  if (unionArea < candidateArea * SPAN_TIGHTEN_MIN_AREA_RATIO) return candidate
  return union
}
