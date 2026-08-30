import type { DocumentLayoutBox, DocumentLayoutPage } from "../../shared/documentLayout"
import type { PdfFeature, PdfFeatureRect, PdfTextSpan } from "./pdfFeatureDetection"
import { normalizedHeadingText } from "./pdfHeadingClassifier"
import { type ScoredFigureRect, selectFigureGroup } from "./pdfModelFigureGrouping"

type VisualKind = "figure" | "table"

export type AppliedModelLayout = {
  readonly features: readonly PdfFeature[]
  readonly boundFeatureKeys: ReadonlySet<string>
}

export function pdfFeatureKey(feature: PdfFeature): string {
  return `${feature.kind}:${feature.sourceSpanIds[0] ?? feature.label}`
}

function visualKind(label: DocumentLayoutBox["label"]): VisualKind | null {
  switch (label) {
    case "chart":
    case "image":
      return "figure"
    case "table":
      return "table"
    case "doc_title":
    case "paragraph_title":
    case "figure_title":
      return null
  }
}

function scaledRect(
  box: DocumentLayoutBox,
  layoutPage: DocumentLayoutPage,
  pageWidth: number,
  pageHeight: number,
): PdfFeatureRect {
  const scaleX = pageWidth / layoutPage.width
  const scaleY = pageHeight / layoutPage.height
  return {
    x: box.x * scaleX,
    y: box.y * scaleY,
    width: box.width * scaleX,
    height: box.height * scaleY,
  }
}

function unionRects(rects: readonly PdfFeatureRect[]): PdfFeatureRect | null {
  if (rects.length === 0) return null
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x, y, width: right - x, height: bottom - y }
}

function horizontalOverlap(left: PdfFeatureRect, right: PdfFeatureRect): number {
  const overlap = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  return overlap / Math.max(1, Math.min(left.width, right.width))
}

function intersectionRatio(left: PdfFeatureRect, right: PdfFeatureRect): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return (
    (width * height) / Math.max(1, Math.min(left.width * left.height, right.width * right.height))
  )
}

function modelHeadingFeatures(
  layoutPage: DocumentLayoutPage,
  spans: readonly PdfTextSpan[],
  current: readonly PdfFeature[],
  pageWidth: number,
  pageHeight: number,
): readonly PdfFeature[] {
  const containers = current.filter(
    (feature) => feature.kind === "figure" || feature.kind === "table",
  )
  return layoutPage.boxes.flatMap((box) => {
    if ((box.label !== "doc_title" && box.label !== "paragraph_title") || box.score < 0.8) return []
    const rect = scaledRect(box, layoutPage, pageWidth, pageHeight)
    if (containers.some((feature) => intersectionRatio(feature.rect, rect) > 0.5)) return []
    if (
      current.some(
        (feature) =>
          (feature.kind === "heading" || feature.kind === "subheading") &&
          intersectionRatio(feature.rect, rect) > 0.45,
      )
    )
      return []
    const owned = spans
      .filter((span) => {
        const centerX = span.x + span.width / 2
        const centerY = span.y + span.height / 2
        return (
          centerX >= rect.x &&
          centerX <= rect.x + rect.width &&
          centerY >= rect.y &&
          centerY <= rect.y + rect.height
        )
      })
      .sort((left, right) => left.y - right.y || left.x - right.x)
    if (owned.length === 0) return []
    const label = normalizedHeadingText(owned.map((span) => span.text).join(" "))
    if (label.length < 3 || label.length > 180) return []
    return [
      {
        kind: box.label === "doc_title" ? "heading" : "subheading",
        pageNumber: layoutPage.pageNumber,
        rect,
        label,
        context: label,
        priority: box.score,
        sourceSpanIds: owned.map((span) => span.id),
      } satisfies PdfFeature,
    ]
  })
}

function captionScore(
  kind: VisualKind,
  visual: PdfFeatureRect,
  caption: PdfTextSpan,
  pageHeight: number,
): number {
  const captionRect = {
    x: caption.x,
    y: caption.y,
    width: caption.width,
    height: caption.height,
  }
  const overlap = horizontalOverlap(visual, captionRect)
  const aboveDistance = Math.abs(caption.y - (visual.y + visual.height))
  const belowDistance = Math.abs(visual.y - (caption.y + caption.height))
  const distance = kind === "figure" ? aboveDistance : Math.min(aboveDistance, belowDistance)
  const directionPenalty =
    kind === "figure" && visual.y > caption.y + caption.height ? pageHeight * 0.5 : 0
  return overlap * 0.4 - ((distance + directionPenalty) / pageHeight) * 4
}

export function applyModelLayoutBounds(
  features: readonly PdfFeature[],
  spans: readonly PdfTextSpan[],
  layoutPage: DocumentLayoutPage | undefined,
  pageWidth: number,
  pageHeight: number,
): AppliedModelLayout {
  if (!layoutPage) return { features, boundFeatureKeys: new Set() }
  const byId = new Map(spans.map((span) => [span.id, span] as const))
  const visualFeatures = features.filter(
    (feature) => feature.kind === "figure" || feature.kind === "table",
  )
  const assignments = new Map<string, PdfFeatureRect[]>()
  const figureCandidates = new Map<string, ScoredFigureRect[]>()
  const assignmentScores = new Map<string, number>()
  for (const box of layoutPage.boxes) {
    if (box.score < 0.55) continue
    const kind = visualKind(box.label)
    if (!kind) continue
    const visual = scaledRect(box, layoutPage, pageWidth, pageHeight)
    const candidates = visualFeatures
      .filter((feature) => feature.kind === kind)
      .flatMap((feature) => {
        const captionId = feature.sourceSpanIds[0]
        const caption = captionId ? byId.get(captionId) : undefined
        return caption
          ? [{ feature, score: captionScore(kind, visual, caption, pageHeight), caption }]
          : []
      })
      .filter(({ caption }) => {
        const distance = Math.min(
          Math.abs(caption.y - (visual.y + visual.height)),
          Math.abs(visual.y - (caption.y + caption.height)),
        )
        const maximumDistance = kind === "figure" ? pageHeight * 0.55 : pageHeight * 0.3
        return distance <= maximumDistance
      })
    const directionMatched =
      kind === "figure"
        ? candidates.filter(({ caption }) => visual.y <= caption.y + caption.height)
        : candidates
    const ranked = [...(directionMatched.length > 0 ? directionMatched : candidates)].sort(
      (left, right) => right.score - left.score,
    )
    const owner = ranked[0]?.feature
    const ownerScore = ranked[0]?.score ?? -2
    if (!owner || ownerScore < -1.2) continue
    const key = pdfFeatureKey(owner)
    if (kind === "table") {
      if (ownerScore > (assignmentScores.get(key) ?? Number.NEGATIVE_INFINITY)) {
        assignments.set(key, [visual])
        assignmentScores.set(key, ownerScore)
      }
      continue
    }
    const candidatesForOwner = figureCandidates.get(key) ?? []
    candidatesForOwner.push({ rect: visual, ownershipScore: ownerScore })
    figureCandidates.set(key, candidatesForOwner)
  }
  for (const [key, candidates] of figureCandidates) {
    assignments.set(key, [...selectFigureGroup(candidates)])
  }
  const boundFeatureKeys = new Set(assignments.keys())
  const modelBoundFeatures = features.map((feature) => {
    const assigned = assignments.get(pdfFeatureKey(feature))
    const rect = assigned ? unionRects(assigned) : null
    return rect ? { ...feature, rect } : feature
  })
  return {
    features: [
      ...modelBoundFeatures,
      ...modelHeadingFeatures(layoutPage, spans, modelBoundFeatures, pageWidth, pageHeight),
    ],
    boundFeatureKeys,
  }
}
