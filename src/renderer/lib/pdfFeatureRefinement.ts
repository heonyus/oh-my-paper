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
  return containers.some(
    (container) =>
      feature.sourceSpanIds.some((id: string) => container.sourceSpanIds.includes(id)) ||
      centerInside(container.rect, feature.rect),
  )
}

export function detectFiguresAndTables(
  spans: readonly PdfTextSpan[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  consumedAbove: ReadonlySet<string> = new Set(),
): { readonly features: readonly PdfFeature[]; readonly consumed: ReadonlySet<string> } {
  const features: PdfFeature[] = []
  const consumed = new Set<string>(consumedAbove)
  const figureCaptions = spans.filter((span) =>
    /^(?:Figure|Fig\.?)\s*\d+\s*[:.]/iu.test(span.text.trim()),
  )

  for (const span of spans) {
    const text = span.text.trim()
    const figMatch = text.match(/^(?:Figure|Fig\.?)\s*(\d+)\s*[:.]\s*(.*)$/iu)
    const tabMatch = text.match(/^(?:Table|Tab\.?)\s*(\d+)\s*[:.]\s*(.*)$/iu)
    if (!figMatch && !tabMatch) continue

    consumed.add(span.id)
    const isFig = Boolean(figMatch)
    const num = figMatch?.[1] ?? tabMatch?.[1] ?? ""
    const label = (isFig ? "Figure " : "Table ") + num
    const spanRight = span.x + span.width
    const captionRow = figureCaptions
      .filter(
        (candidate) =>
          Math.abs(candidate.y + candidate.height / 2 - (span.y + span.height / 2)) <=
          Math.max(candidate.height, span.height),
      )
      .sort((left, right) => left.x - right.x)
    const visualLabels = spans.filter((candidate) => {
      const words = candidate.text.match(/[A-Za-z]{2,}/gu)?.length ?? 0
      return (
        candidate.y < span.y &&
        candidate.y >= span.y - pageHeight * 0.45 &&
        candidate.text.length <= 48 &&
        words <= 5 &&
        !/^(?:Figure|Fig\.?)\s*\d+/iu.test(candidate.text.trim())
      )
    })
    const spansBothHalves =
      visualLabels.filter((candidate) => candidate.x + candidate.width / 2 < pageWidth / 2)
        .length >= 3 &&
      visualLabels.filter((candidate) => candidate.x + candidate.width / 2 >= pageWidth / 2)
        .length >= 3
    const isFullWidthFigure =
      isFig &&
      captionRow.length === 1 &&
      (span.width >= pageWidth * 0.62 ||
        (span.x < pageWidth * 0.35 && spanRight > pageWidth * 0.65) ||
        (span.x < pageWidth * 0.35 && spansBothHalves))
    const captionCenter = span.x + span.width / 2
    const figureWindow = Math.max(pageWidth * 0.28, span.width + pageWidth * 0.06)
    const captionIndex = captionRow.findIndex((candidate) => candidate.id === span.id)
    const previousCaption = captionIndex > 0 ? captionRow[captionIndex - 1] : undefined
    const nextCaption = captionIndex >= 0 ? captionRow[captionIndex + 1] : undefined
    const previousCenter = previousCaption ? previousCaption.x + previousCaption.width / 2 : null
    const nextCenter = nextCaption ? nextCaption.x + nextCaption.width / 2 : null
    const colLeft =
      isFig && !isFullWidthFigure
        ? previousCenter === null
          ? Math.max(
              0,
              captionCenter - (nextCenter === null ? figureWindow : nextCenter - captionCenter) / 2,
            )
          : (previousCenter + captionCenter) / 2
        : 0
    const colRight =
      isFig && !isFullWidthFigure
        ? nextCenter === null
          ? Math.min(
              pageWidth,
              captionCenter +
                (previousCenter === null ? figureWindow : captionCenter - previousCenter) / 2,
            )
          : (captionCenter + nextCenter) / 2
        : pageWidth
    const lookback = pageHeight * 0.58

    const candidates = spans.filter((s) => {
      if (s.id === span.id || consumedAbove.has(s.id)) return false
      if (s.y >= span.y || s.y < span.y - lookback) return false
      const overlap = Math.min(s.x + s.width, colRight) - Math.max(s.x, colLeft)
      if (overlap <= 0) return false
      const center = s.x + s.width / 2
      return center >= colLeft && center <= colRight
    })
    const isSectionHeading = (s: PdfTextSpan) =>
      (s.fontSize * 600) / pageWidth >= 11 &&
      (/^(?:\d+(?:\.\d+)*|[A-Z](?:\.\d+)*)\s+[A-Z]/u.test(s.text.trim()) ||
        /^(?:Abstract|Introduction|Background|Related\s+Work|Methods|Experiments|Results|Discussion|Conclusion|References)\b/iu.test(
          s.text.trim(),
        ))
    const boundaryAbove = candidates
      .filter(
        (s) =>
          isSectionHeading(s) ||
          isAuthorOrAffiliation(s.text) ||
          (s.text.length >= 35 && /[.?!]$/u.test(s.text.trim())) ||
          /^(?:Figure|Fig\.?|Table|Tab\.?)\s*\d+/iu.test(s.text.trim()),
      )
      .sort((a, b) => b.y - a.y)[0]
    const cutoffY = boundaryAbove ? boundaryAbove.y + boundaryAbove.height : 0
    const internal = candidates.filter((s) => s.y > cutoffY)

    for (const s of internal) consumed.add(s.id)
    const topY =
      internal.length > 0
        ? Math.min(...internal.map((s) => s.y)) - (isFig ? 4 : 8)
        : boundaryAbove
          ? boundaryAbove.y + boundaryAbove.height + 8
          : Math.max(0, span.y - pageHeight * 0.22)
    const rectX = internal.length > 0 ? Math.min(span.x, ...internal.map((s) => s.x)) - 4 : colLeft
    const rightX =
      internal.length > 0
        ? Math.max(spanRight, ...internal.map((s) => s.x + s.width)) + 4
        : colRight
    const bottomY = Math.max(topY + 20, span.y - 4)
    const rect: PdfFeatureRect = {
      x: Math.max(0, rectX),
      y: Math.max(0, topY),
      width: Math.min(pageWidth - Math.max(0, rectX), Math.max(span.width, rightX - rectX)),
      height: bottomY - topY,
    }

    features.push({
      kind: isFig ? "figure" : "table",
      pageNumber,
      rect,
      label,
      context: text,
      priority: isFig ? 0.75 : 0.85,
      sourceSpanIds: [span.id, ...internal.map((s) => s.id)],
    })
  }
  return { features, consumed }
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
