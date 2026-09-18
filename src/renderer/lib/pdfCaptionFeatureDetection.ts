import type { PdfFeature, PdfFeatureRect, PdfTextSpan } from "./pdfFeatureDetection"
import { isSectionHeadingSpan } from "./pdfHeadingClassifier"

const CAPTION = /^(?:Figure|Fig\.?|Table|Tab\.?)\s*\d+\s*[:.|]/iu

function isAuthorOrAffiliation(text: string): boolean {
  return /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|http|www|arXiv:|University|Institute|Laboratory|Department|School|College|Hospital|Center|Author|Contribution/iu.test(
    text,
  )
}

function isBodyProse(span: PdfTextSpan, columnWidth: number): boolean {
  const words = span.text.match(/[A-Za-z]{2,}/gu)?.length ?? 0
  return span.text.length >= 30 && (words >= 6 || (words >= 5 && span.width >= columnWidth * 0.62))
}

function isEquationText(text: string): boolean {
  return /[=∑∫√≤≥±≈∼~πθσμφ∆∪]/u.test(text) && /\(\d{1,3}(?:\.\d+)?\)\s*$/u.test(text)
}

function overlapsColumn(span: PdfTextSpan, left: number, right: number): boolean {
  return Math.min(span.x + span.width, right) - Math.max(span.x, left) > 0
}

function columnBounds(
  caption: PdfTextSpan,
  sameKindCaptions: readonly PdfTextSpan[],
  pageWidth: number,
): { readonly left: number; readonly right: number } {
  const center = caption.x + caption.width / 2
  const sameRow = sameKindCaptions
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
  return {
    left: previous ? (previous.x + previous.width / 2 + center) / 2 : 0,
    right: next ? (center + next.x + next.width / 2) / 2 : pageWidth,
  }
}

function continuousBand(
  candidates: readonly PdfTextSpan[],
  caption: PdfTextSpan,
  direction: "above" | "below",
  pageWidth: number,
): readonly PdfTextSpan[] {
  const compactLimit = caption.fontSize * 0.9
  const eligible = candidates.filter((span) => {
    const compactTableHeading =
      isSectionHeadingSpan(span, pageWidth) &&
      span.fontSize <= caption.fontSize * 1.1 &&
      span.width <= pageWidth * 0.25
    return (
      !CAPTION.test(span.text.trim()) &&
      (!isSectionHeadingSpan(span, pageWidth) || compactTableHeading) &&
      !isEquationText(span.text) &&
      (span.fontSize <= compactLimit || !isBodyProse(span, pageWidth))
    )
  })
  const ordered = [...eligible].sort((left, right) =>
    direction === "below" ? left.y - right.y : right.y - left.y,
  )
  const first = ordered[0]
  if (!first) return []
  const band: PdfTextSpan[] = [first]
  for (const row of ordered.slice(1)) {
    const edge = band.at(-1)
    if (!edge) break
    const gap =
      direction === "below" ? row.y - (edge.y + edge.height) : edge.y - (row.y + row.height)
    const maximumGap = direction === "above" ? 60 : 20
    const allowedGap = Math.max(13, Math.min(maximumGap, Math.max(edge.height, row.height) * 4.5))
    if (gap > allowedGap) break
    band.push(row)
  }
  return band.sort((left, right) => left.y - right.y || left.x - right.x)
}

function tableBand(
  above: readonly PdfTextSpan[],
  below: readonly PdfTextSpan[],
  caption: PdfTextSpan,
  pageWidth: number,
): readonly PdfTextSpan[] {
  const upper = continuousBand(above, caption, "above", pageWidth)
  const lower = continuousBand(below, caption, "below", pageWidth)
  const score = (rows: readonly PdfTextSpan[], direction: "above" | "below"): number => {
    if (rows.length === 0) return Number.NEGATIVE_INFINITY
    const nearest = direction === "below" ? rows[0] : rows.at(-1)
    if (!nearest) return Number.NEGATIVE_INFINITY
    const distance =
      direction === "below"
        ? nearest.y - (caption.y + caption.height)
        : caption.y - (nearest.y + nearest.height)
    const compact = rows.filter((row) => row.fontSize <= caption.fontSize * 0.9).length
    const coverage = Math.max(...rows.map((row) => row.width)) / pageWidth
    return rows.length * 3 + compact * 2 + coverage * 2 - Math.max(0, distance) / 24
  }
  return score(lower, "below") >= score(upper, "above") ? lower : upper
}

function rectForRows(
  rows: readonly PdfTextSpan[],
  fallback: PdfFeatureRect,
  pageWidth: number,
  pageHeight: number,
): PdfFeatureRect {
  if (rows.length === 0) return fallback
  const x = Math.max(0, Math.min(...rows.map((row) => row.x)) - 4)
  const y = Math.max(0, Math.min(...rows.map((row) => row.y)) - 5)
  const right = Math.min(pageWidth, Math.max(...rows.map((row) => row.x + row.width)) + 4)
  const bottom = Math.min(pageHeight, Math.max(...rows.map((row) => row.y + row.height)) + 5)
  return { x, y, width: Math.max(24, right - x), height: Math.max(20, bottom - y) }
}

function figureRows(
  above: readonly PdfTextSpan[],
  caption: PdfTextSpan,
  pageWidth: number,
  columnWidth: number,
): readonly PdfTextSpan[] {
  const boundaries = above.filter(
    (span) =>
      isSectionHeadingSpan(span, pageWidth) ||
      isAuthorOrAffiliation(span.text) ||
      CAPTION.test(span.text.trim()) ||
      (isBodyProse(span, columnWidth) && span.fontSize >= caption.fontSize * 0.92),
  )
  const boundary = [...boundaries].sort((left, right) => right.y - left.y)[0]
  const minimumY = boundary ? boundary.y + boundary.height + 4 : 0
  return above.filter(
    (span) =>
      span.y >= minimumY &&
      !boundaries.some((candidate) => candidate.id === span.id) &&
      !(isBodyProse(span, columnWidth) && span.fontSize >= caption.fontSize * 0.92),
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
  const captions = spans.filter((span) => CAPTION.test(span.text.trim()))
  const figureCaptions = captions.filter((span) => /^(?:Figure|Fig\.?)/iu.test(span.text.trim()))
  const tableCaptions = captions.filter((span) => /^(?:Table|Tab\.?)/iu.test(span.text.trim()))
  for (const caption of captions) {
    const isFigure = /^(?:Figure|Fig\.?)/iu.test(caption.text.trim())
    const number = caption.text.match(/^(?:Figure|Fig\.?|Table|Tab\.?)\s*(\d+)/iu)?.[1]
    if (!number) continue
    const columns = columnBounds(caption, isFigure ? figureCaptions : tableCaptions, pageWidth)
    const searchDistance = pageHeight * 0.58
    const relevant = (span: PdfTextSpan): boolean =>
      span.id !== caption.id &&
      !consumed.has(span.id) &&
      overlapsColumn(span, columns.left, columns.right)
    const above = spans.filter(
      (span) => relevant(span) && span.y < caption.y && span.y >= caption.y - searchDistance,
    )
    const below = spans.filter(
      (span) =>
        relevant(span) &&
        span.y >= caption.y + caption.height &&
        span.y <= caption.y + searchDistance,
    )
    const selected = isFigure
      ? figureRows(above, caption, pageWidth, columns.right - columns.left)
      : tableBand(above, below, caption, pageWidth)
    const columnWidth = columns.right - columns.left
    const floatedFigure = isFigure && selected.length === 0 && columnWidth <= pageWidth * 0.55
    const floatPad = Math.min(columnWidth * 0.14, Math.max(14, caption.width * 0.22))
    const figureLookback = floatedFigure ? pageHeight * 0.22 : pageHeight * 0.32
    const fallback = isFigure
      ? {
          x: floatedFigure ? Math.max(columns.left, caption.x - floatPad) : columns.left,
          y: Math.max(0, caption.y - figureLookback),
          width: floatedFigure
            ? Math.min(columns.right, caption.x + caption.width + floatPad) -
              Math.max(columns.left, caption.x - floatPad)
            : columnWidth,
          height: Math.min(figureLookback, caption.y),
        }
      : {
          x: columns.left,
          y: Math.min(pageHeight, caption.y + caption.height + 4),
          width: columns.right - columns.left,
          height: 24,
        }
    const rect = rectForRows(selected, fallback, pageWidth, pageHeight)
    for (const span of selected) consumed.add(span.id)
    consumed.add(caption.id)
    features.push({
      kind: isFigure ? "figure" : "table",
      pageNumber,
      rect,
      label: `${isFigure ? "Figure" : "Table"} ${number}`,
      context: caption.text.trim(),
      priority: isFigure ? 0.75 : 0.85,
      sourceSpanIds: [caption.id, ...selected.map((span) => span.id)],
    })
  }
  return { features, consumed }
}
