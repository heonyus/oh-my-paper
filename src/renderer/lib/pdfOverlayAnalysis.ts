import type { DocumentLayoutPage } from "../../shared/documentLayout"
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
import { applyModelLayoutBounds, pdfFeatureKey } from "./pdfModelLayout"
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

function boundsArea(bounds: DetectedStructure["bounds"]): number {
  return bounds.width * bounds.height
}

function boundsIntersection(
  left: DetectedStructure["bounds"],
  right: DetectedStructure["bounds"],
): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return width * height
}

function semanticVisualNumber(structure: DetectedStructure): number | null {
  if (structure.kind !== "figure" && structure.kind !== "table") return null
  const match = /^\s*(?:figure|fig\.?|table|tab\.?)\s*(\d+)/iu.exec(structure.title)
  const number = match?.[1]
  if (!number) return null
  const parsed = Number.parseInt(number, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function structuresDuplicate(parsed: DetectedStructure, detected: DetectedStructure): boolean {
  if (parsed.kind !== detected.kind) return false
  const parsedNumber = semanticVisualNumber(parsed)
  const detectedNumber = semanticVisualNumber(detected)
  if (parsedNumber !== null && detectedNumber !== null) return parsedNumber === detectedNumber
  const smaller = Math.min(boundsArea(parsed.bounds), boundsArea(detected.bounds))
  if (smaller <= 0) return false
  return boundsIntersection(parsed.bounds, detected.bounds) / smaller > 0.4
}

export function mergeOverlayStructures(
  parsed: readonly DetectedStructure[],
  detected: readonly DetectedStructure[],
): readonly DetectedStructure[] {
  const additions = detected.filter(
    (candidate) => !parsed.some((existing) => structuresDuplicate(existing, candidate)),
  )
  return [...parsed, ...additions].sort(
    (left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x,
  )
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
  modelLayout?: DocumentLayoutPage,
): PageOverlayState | null {
  const pageRect = pageDiv.getBoundingClientRect()
  if (
    Math.abs(pageRect.width - captured.input.pageWidth) > 0.5 ||
    Math.abs(pageRect.height - captured.input.pageHeight) > 0.5
  )
    return null
  const modelApplied = applyModelLayoutBounds(
    detected,
    captured.spans,
    modelLayout,
    pageRect.width,
    pageRect.height,
  )
  const features = modelApplied.features.map((feature) => {
    if (modelApplied.boundFeatureKeys.has(pdfFeatureKey(feature))) return feature
    if (feature.kind === "figure" || feature.kind === "table") {
      const captionId = feature.sourceSpanIds[0]
      const caption = captionId ? captured.spans.find((span) => span.id === captionId) : undefined
      const ink = caption ? inkBoundsForCaption(pageDiv, caption, feature.rect, feature.kind) : null
      const minimumWidthRatio = feature.kind === "figure" ? 0.28 : 0.45
      if (ink && hasPlausibleInkCoverage(feature.rect, ink, minimumWidthRatio))
        return { ...feature, rect: ink }
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
