import { mergeAdjacentEquations } from "./pdfEquationBlocks"
import type { PdfFeature, PdfFeatureRect, PdfTextSpan } from "./pdfFeatureDetection"

function unionRect(left: PdfFeatureRect, right: PdfFeatureRect): PdfFeatureRect {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const farRight = Math.max(left.x + left.width, right.x + right.width)
  const bottom = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: farRight - x, height: bottom - y }
}

function spanFor(feature: PdfFeature, byId: ReadonlyMap<string, PdfTextSpan>): PdfTextSpan | null {
  const id = feature.sourceSpanIds[0]
  return id ? (byId.get(id) ?? null) : null
}

function isAuthorOrAffiliation(text: string): boolean {
  return (
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|http|www|arXiv:|University|Institute|Laboratory|Department|School|College|Hospital|Center|Author|Contribution/iu.test(
      text,
    ) ||
    /^[♠♦†*∗,\s]+$/u.test(text) ||
    /\{[\w,]+\}/u.test(text)
  )
}

function canMergeHeading(
  left: PdfFeature,
  right: PdfFeature,
  byId: ReadonlyMap<string, PdfTextSpan>,
  pageWidth: number,
): boolean {
  if (left.kind !== "heading" || right.kind !== "heading") return false
  const leftSpan = spanFor(left, byId)
  const rightSpan = spanFor(right, byId)
  if (!leftSpan || !rightSpan) return false
  if (isAuthorOrAffiliation(left.label) || isAuthorOrAffiliation(right.label)) return false
  if (isAuthorOrAffiliation(left.context) || isAuthorOrAffiliation(right.context)) return false
  const gap = right.rect.y - (left.rect.y + left.rect.height)
  const leftCenter = left.rect.x + left.rect.width / 2
  const rightCenter = right.rect.x + right.rect.width / 2
  return (
    gap >= -2 &&
    gap <= Math.max(left.rect.height, right.rect.height) * 0.45 &&
    Math.abs(leftSpan.fontSize - rightSpan.fontSize) <= 1.5 &&
    Math.abs(leftCenter - rightCenter) <= pageWidth * 0.15
  )
}

function mergeHeading(left: PdfFeature, right: PdfFeature): PdfFeature {
  return {
    ...left,
    rect: unionRect(left.rect, right.rect),
    label: `${left.label} ${right.label}`,
    context: `${left.context} ${right.context}`,
    priority: Math.max(left.priority, right.priority),
    sourceSpanIds: [...left.sourceSpanIds, ...right.sourceSpanIds],
  }
}

function mergeHeadings(
  features: readonly PdfFeature[],
  spans: readonly PdfTextSpan[],
  pageWidth: number,
): readonly PdfFeature[] {
  const byId = new Map(spans.map((span) => [span.id, span] as const))
  const merged: PdfFeature[] = []
  for (const feature of features) {
    const previous = merged.at(-1)
    if (previous && canMergeHeading(previous, feature, byId, pageWidth)) {
      merged[merged.length - 1] = mergeHeading(previous, feature)
    } else merged.push(feature)
  }
  return merged
}

function centerInside(container: PdfFeatureRect, inner: PdfFeatureRect): boolean {
  const centerX = inner.x + inner.width / 2
  const centerY = inner.y + inner.height / 2
  const horizontal = centerX >= container.x - 20 && centerX <= container.x + container.width + 20
  const vertical = centerY >= container.y - 10 && centerY <= container.y + container.height + 10
  return horizontal && vertical
}

function isNestedMark(feature: PdfFeature, containers: readonly PdfFeature[]): boolean {
  if (feature.kind === "figure" || feature.kind === "table") return false
  return containers.some((container) => {
    if (feature.kind === "citation" && container.sourceSpanIds[0] === feature.sourceSpanIds[0]) {
      return false
    }
    return (
      feature.sourceSpanIds.some((id: string) => container.sourceSpanIds.includes(id)) ||
      centerInside(container.rect, feature.rect)
    )
  })
}

export function refinePdfFeatures(
  features: readonly PdfFeature[],
  spans: readonly PdfTextSpan[],
  pageWidth: number,
): readonly PdfFeature[] {
  const sorted = [...features].sort(
    (left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x,
  )
  const merged = mergeAdjacentEquations(mergeHeadings(sorted, spans, pageWidth), pageWidth)
  const containers = merged.filter(
    (feature) => feature.kind === "figure" || feature.kind === "table",
  )
  return merged.filter((feature) => !isNestedMark(feature, containers))
}
