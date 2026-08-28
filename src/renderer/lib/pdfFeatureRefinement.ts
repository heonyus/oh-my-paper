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

function isEquationText(text: string): boolean {
  return /[=∑∫√≤≥±≈∼~πθσμφ∆∪]/u.test(text) && /\(\d{1,3}(?:\.\d+)?\)\s*$/u.test(text)
}

function isBodyProse(span: PdfTextSpan, columnWidth: number): boolean {
  const words = span.text.match(/[A-Za-z]{2,}/gu)?.length ?? 0
  return span.text.length >= 30 && (words >= 6 || (words >= 5 && span.width >= columnWidth * 0.62))
}

function isSectionHeading(text: string, fontSize: number, pageWidth: number): boolean {
  const normalizedSize = (fontSize * 600) / pageWidth
  const normalized = text.trim()
  return (
    (normalizedSize >= 9.5 &&
      /^(?:Abstract|Introduction|Background|Related\s+Work|Methods|Experiments|Results|Discussion|Conclusion|References|Analysis)\b/iu.test(
        normalized,
      )) ||
    (normalizedSize >= 10.5 && /^(?:\d+(?:\.\d+)*|[A-Z](?:\.\d+)*)\s+[A-Z]/u.test(normalized))
  )
}

function overlapsColumn(span: PdfTextSpan, left: number, right: number): boolean {
  return Math.min(span.x + span.width, right) - Math.max(span.x, left) > 0
}

function columnBounds(
  caption: PdfTextSpan,
  captions: readonly PdfTextSpan[],
  pageWidth: number,
  isFigure: boolean,
): { readonly left: number; readonly right: number } {
  if (!isFigure) return { left: 0, right: pageWidth }
  const center = caption.x + caption.width / 2
  const sameRow = captions
    .filter(
      (candidate) =>
        Math.abs(candidate.y - caption.y) <= Math.max(candidate.height, caption.height),
    )
    .sort((left, right) => left.x - right.x)
  const index = sameRow.findIndex((candidate) => candidate.id === caption.id)
  const previous = index > 0 ? sameRow[index - 1] : undefined
  const next = index >= 0 ? sameRow[index + 1] : undefined
  if (sameRow.length === 1 && caption.width < pageWidth * 0.52) {
    if (Math.abs(center - pageWidth / 2) > pageWidth * 0.15) {
      return center < pageWidth / 2
        ? { left: 0, right: pageWidth / 2 }
        : { left: pageWidth / 2, right: pageWidth }
    }
  }
  const left = previous ? (previous.x + previous.width / 2 + center) / 2 : 0
  const right = next ? (center + next.x + next.width / 2) / 2 : pageWidth
  return { left, right }
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
  const captions = spans.filter((span) =>
    /^(?:Figure|Fig\.?|Table|Tab\.?)\s*\d+\s*[:.]/iu.test(span.text.trim()),
  )
  const figureCaptions = captions.filter((span) => /^(?:Figure|Fig\.?)/iu.test(span.text.trim()))

  for (const caption of captions) {
    const text = caption.text.trim()
    const figMatch = text.match(/^(?:Figure|Fig\.?)\s*(\d+)\s*[:.]/iu)
    const tabMatch = text.match(/^(?:Table|Tab\.?)\s*(\d+)\s*[:.]/iu)
    const isFigure = Boolean(figMatch)
    const number = figMatch?.[1] ?? tabMatch?.[1] ?? ""
    if (!number) continue

    const columns = columnBounds(caption, figureCaptions, pageWidth, isFigure)
    const lookback = pageHeight * 0.58
    const above = spans.filter(
      (span) =>
        span.id !== caption.id &&
        span.y < caption.y &&
        span.y >= caption.y - lookback &&
        !consumed.has(span.id) &&
        overlapsColumn(span, columns.left, columns.right),
    )
    const below = spans.filter(
      (span) =>
        span.id !== caption.id &&
        span.y >= caption.y + caption.height + 18 &&
        span.y <= caption.y + pageHeight * 0.58 &&
        !consumed.has(span.id) &&
        overlapsColumn(span, columns.left, columns.right),
    )

    let selected: readonly PdfTextSpan[]
    let top: number
    let bottom: number
    let left: number
    let right: number

    if (isFigure) {
      const structural = above.filter(
        (span) =>
          isSectionHeading(span.text, span.fontSize, pageWidth) ||
          isAuthorOrAffiliation(span.text) ||
          /^(?:Figure|Fig\.?|Table|Tab\.?)\s*\d+\b/iu.test(span.text.trim()),
      )
      const visual = above.filter(
        (span) =>
          !isBodyProse(span, columns.right - columns.left) &&
          !structural.some((boundary) => boundary.id === span.id),
      )
      const boundary = structural
        .concat(
          above.filter(
            (span) =>
              isBodyProse(span, columns.right - columns.left) && /[.?!:]$/u.test(span.text.trim()),
          ),
        )
        .sort((leftSpan, rightSpan) => rightSpan.y - leftSpan.y)[0]
      selected = visual
      top = boundary
        ? boundary.y + boundary.height + 8
        : visual.length
          ? Math.max(0, Math.min(...visual.map((span) => span.y)) - 8)
          : Math.max(0, caption.y - pageHeight * 0.22)
      bottom = Math.max(top + 20, caption.y - 4)
      left = visual.length
        ? Math.max(0, Math.min(caption.x, ...visual.map((span) => span.x)) - 4)
        : columns.left
      right = visual.length
        ? Math.min(
            pageWidth,
            Math.max(caption.x + caption.width, ...visual.map((span) => span.x + span.width)) + 4,
          )
        : columns.right
    } else {
      const tableRows = below.filter(
        (span) =>
          !isSectionHeading(span.text, span.fontSize, pageWidth) &&
          !/^(?:Figure|Fig\.?|Table|Tab\.?)\s*\d+\b/iu.test(span.text.trim()),
      )
      const compactTableRows = tableRows.filter((span) => span.fontSize <= caption.fontSize * 0.85)
      const preferredRows = compactTableRows.length > 0 ? compactTableRows : tableRows
      const fallbackRows = above.filter(
        (span) =>
          !isBodyProse(span, pageWidth) &&
          !isSectionHeading(span.text, span.fontSize, pageWidth) &&
          !isEquationText(span.text),
      )
      selected = preferredRows.length > 0 ? preferredRows : fallbackRows
      const firstRow = selected[0]
      const rows = selected.filter(
        (span) =>
          firstRow !== undefined && (span.y <= firstRow.y + 90 || !isBodyProse(span, pageWidth)),
      )
      selected = rows
      top = rows.length
        ? Math.max(0, Math.min(...rows.map((span) => span.y)) - 6)
        : Math.max(0, caption.y + caption.height + 18)
      bottom = rows.length
        ? Math.min(pageHeight, Math.max(...rows.map((span) => span.y + span.height)) + 6)
        : Math.min(pageHeight, top + 24)
      left = rows.length
        ? Math.max(0, Math.min(caption.x, ...rows.map((span) => span.x)) - 4)
        : columns.left
      right = rows.length
        ? Math.min(
            pageWidth,
            Math.max(caption.x + caption.width, ...rows.map((span) => span.x + span.width)) + 4,
          )
        : columns.right
    }

    for (const span of selected) consumed.add(span.id)
    consumed.add(caption.id)
    const rect: PdfFeatureRect = {
      x: left,
      y: top,
      width: Math.max(24, right - left),
      height: Math.max(20, bottom - top),
    }
    features.push({
      kind: isFigure ? "figure" : "table",
      pageNumber,
      rect,
      label: (isFigure ? "Figure " : "Table ") + number,
      context: text,
      priority: isFigure ? 0.75 : 0.85,
      sourceSpanIds: [caption.id, ...selected.map((span) => span.id)],
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
