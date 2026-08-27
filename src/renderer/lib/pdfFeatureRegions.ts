import type { PdfFeatureRect, PdfTextSpan } from "./pdfFeatureDetection"
import {
  analyzePageForOverlays,
  type PdfOverlayFeature,
  type PdfOverlayPageInput,
} from "./pdfOverlayHeuristics"

export type { PdfOverlayFeature, PdfOverlayPageInput }

export function featureRectForSpan(
  span: PdfTextSpan,
  pageWidth: number,
  pageHeight: number,
): PdfFeatureRect {
  const x = Math.min(Math.max(span.x, 0), pageWidth)
  const y = Math.min(Math.max(span.y, 0), pageHeight)
  const right = Math.min(Math.max(span.x + span.width, x), pageWidth)
  const bottom = Math.min(Math.max(span.y + span.height, y), pageHeight)
  return { x, y, width: right - x, height: bottom - y }
}

function isBodyProse(span: PdfTextSpan, columnWidth: number): boolean {
  const words = span.text.match(/[A-Za-z]{2,}/gu)?.length ?? 0
  return words >= 8 || (words >= 5 && span.width > columnWidth * 0.68)
}

function isStopper(span: PdfTextSpan, columnWidth: number): boolean {
  const text = span.text.trim()
  return (
    /^(?:Figure|Fig\.?|Table|Tab\.?)\s+\d+/iu.test(text) ||
    /^\d+(?:\.\d+)*\s+\S/u.test(text) ||
    isBodyProse(span, columnWidth) ||
    /^(Abstract|Introduction|Methods|Results|Discussion|Conclusion|References)$/iu.test(text)
  )
}

export function findCaptionRegion(
  caption: PdfTextSpan,
  spans: readonly PdfTextSpan[],
  pageWidth: number,
  pageHeight: number,
): { readonly rect: PdfFeatureRect; readonly ids: readonly string[] } {
  const isFigure = /^(?:Figure|Fig\.?)/iu.test(caption.text.trim())
  const padX = Math.max(18, Math.min(36, pageWidth * 0.045))
  const columnLeft = Math.max(0, caption.x - padX)
  const columnRight = Math.min(pageWidth, caption.x + caption.width + padX)
  const columnWidth = Math.max(1, columnRight - columnLeft)
  const lookbackTop = Math.max(0, caption.y - pageHeight * (isFigure ? 0.45 : 0.55))
  const above = spans.filter((span) => {
    const center = span.x + span.width / 2
    return (
      span.id !== caption.id &&
      Math.abs(span.rotation ?? 0) % 180 < 15 &&
      span.y + span.height <= caption.y &&
      span.y >= lookbackTop &&
      center >= columnLeft &&
      center <= columnRight
    )
  })
  const nearestStopper = above
    .filter((span) => isStopper(span, columnWidth))
    .sort((left, right) => right.y - left.y)[0]
  const upperBound = nearestStopper ? nearestStopper.y + nearestStopper.height + 8 : lookbackTop
  const content = above.filter((span) => span.y >= upperBound && !isStopper(span, columnWidth))
  const captionRect = featureRectForSpan(caption, pageWidth, pageHeight)
  const top = content.length
    ? Math.max(upperBound, Math.min(...content.map((span) => span.y)) - 24)
    : upperBound
  const left = content.length
    ? Math.max(0, Math.min(captionRect.x, ...content.map((span) => span.x)) - padX)
    : columnLeft
  const right = content.length
    ? Math.min(
        pageWidth,
        Math.max(captionRect.x + captionRect.width, ...content.map((span) => span.x + span.width)) +
          padX,
      )
    : columnRight
  return {
    rect: { x: left, y: top, width: Math.max(24, right - left), height: captionRect.y - top },
    ids: [caption.id, ...content.map((span) => span.id)],
  }
}

export function detectPdfFeatureRegions(page: PdfOverlayPageInput): readonly PdfOverlayFeature[] {
  return analyzePageForOverlays(page)
}
