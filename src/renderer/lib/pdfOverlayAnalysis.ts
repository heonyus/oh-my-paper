import { featureToStructure } from "./pdfDocumentFeatures"
import {
  type DetectPdfFeaturesInput,
  detectPdfFeatures,
  type PdfFeature,
  type PdfTextSpan,
} from "./pdfFeatureDetection"
import { adoptVisualBounds, collectPdfTextSpans } from "./pdfFeatureDom"
import {
  hasPlausibleInkCoverage,
  inkBoundsForCaption,
  tightenCandidateToSpans,
  tightestInkLineBounds,
} from "./pdfInkRegion"
import { mergePdfTextLines } from "./pdfTextLines"
import type { BibliographyMap, DetectedStructure } from "./structureDetector"

export type PageOverlayState = {
  readonly structures: readonly DetectedStructure[]
  readonly pageDiv: HTMLElement
  readonly pageWidth: number
  readonly pageHeight: number
}

export type CapturedPageOverlay = {
  readonly input: DetectPdfFeaturesInput
  readonly spans: readonly PdfTextSpan[]
}

export function analyzePageOverlay(
  pageNumber: number,
  pageDiv: HTMLElement,
  bibliography: BibliographyMap,
): PageOverlayState | null {
  const captured = capturePageOverlayInput(pageNumber, pageDiv)
  if (!captured) return null
  return completePageOverlay(pageDiv, bibliography, captured, detectPdfFeatures(captured.input))
}

export function capturePageOverlayInput(
  pageNumber: number,
  pageDiv: HTMLElement,
): CapturedPageOverlay | null {
  const pageRect = pageDiv.getBoundingClientRect()
  const spans = mergePdfTextLines(collectPdfTextSpans(pageDiv), pageRect.width)
  if (spans.length === 0) return null
  return {
    input: { pageNumber, pageWidth: pageRect.width, pageHeight: pageRect.height, spans },
    spans,
  }
}

export function completePageOverlay(
  pageDiv: HTMLElement,
  bibliography: BibliographyMap,
  captured: CapturedPageOverlay,
  detected: readonly PdfFeature[],
): PageOverlayState | null {
  const pageRect = pageDiv.getBoundingClientRect()
  if (
    Math.abs(pageRect.width - captured.input.pageWidth) > 0.5 ||
    Math.abs(pageRect.height - captured.input.pageHeight) > 0.5
  )
    return null
  const features = detected.map((feature) => {
    if (feature.kind === "figure" || feature.kind === "table") {
      const captionId = feature.sourceSpanIds[0]
      const caption = captionId ? captured.spans.find((span) => span.id === captionId) : undefined
      const ink = caption ? inkBoundsForCaption(pageDiv, caption, feature.rect, feature.kind) : null
      if (ink && hasPlausibleInkCoverage(feature.rect, ink)) return { ...feature, rect: ink }
      return { ...feature, rect: adoptVisualBounds(pageDiv, feature.rect) }
    }
    if (feature.kind === "equation") {
      const tightened = tightenCandidateToSpans(feature.rect, captured.spans)
      return { ...feature, rect: tightestInkLineBounds(pageDiv, tightened) }
    }
    return feature
  })
  return {
    structures: features.map((feature) =>
      featureToStructure(feature, captured.spans, bibliography),
    ),
    pageDiv,
    pageWidth: pageRect.width,
    pageHeight: pageRect.height,
  }
}
