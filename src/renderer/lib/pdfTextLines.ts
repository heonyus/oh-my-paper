import type { PdfTextSpan } from "./pdfFeatureDetection"

type VisualRow = {
  readonly centerY: number
  readonly height: number
  readonly zone: ColumnZone
  readonly spans: PdfTextSpan[]
}

type ColumnZone = "left" | "right" | "full"

export function normalizeExtractedPdfText(value: string): string {
  return value
    .replace(/\b([A-Z])\s+(?=[A-Z]{2,}\b)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim()
}

function columnZone(span: PdfTextSpan, pageWidth: number): ColumnZone {
  const right = span.x + span.width
  if (span.width >= pageWidth * 0.58 || (span.x < pageWidth * 0.42 && right > pageWidth * 0.58)) {
    return "full"
  }
  return span.x + span.width / 2 < pageWidth / 2 ? "left" : "right"
}

function hasTwoColumns(spans: readonly PdfTextSpan[], pageWidth: number): boolean {
  const left = spans.filter((span) => columnZone(span, pageWidth) === "left")
  const right = spans.filter((span) => columnZone(span, pageWidth) === "right")
  let pairedRows = 0
  for (const leftSpan of left) {
    const leftCenter = leftSpan.y + leftSpan.height / 2
    const paired = right.some(
      (rightSpan) =>
        Math.abs(rightSpan.y + rightSpan.height / 2 - leftCenter) <=
        Math.max(leftSpan.height, rightSpan.height) * 0.6,
    )
    if (paired) pairedRows += 1
    if (pairedRows >= 3) return true
  }
  return false
}

function mergeSegment(spans: readonly PdfTextSpan[]): PdfTextSpan {
  const left = Math.min(...spans.map((span) => span.x))
  const top = Math.min(...spans.map((span) => span.y))
  const right = Math.max(...spans.map((span) => span.x + span.width))
  const bottom = Math.max(...spans.map((span) => span.y + span.height))
  return {
    id: spans.map((span) => span.id).join("+"),
    text: normalizeExtractedPdfText(spans.map((span) => span.text).join(" ")),
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    fontSize: Math.max(...spans.map((span) => span.fontSize)),
    fontWeight: Math.max(...spans.map((span) => span.fontWeight)),
    rotation: spans[0]?.rotation ?? 0,
  }
}

export function mergePdfTextLines(
  spans: readonly PdfTextSpan[],
  pageWidth?: number,
): readonly PdfTextSpan[] {
  const rows: VisualRow[] = []
  const twoColumns = pageWidth !== undefined && hasTwoColumns(spans, pageWidth)
  for (const span of [...spans].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const centerY = span.y + span.height / 2
    const zone = twoColumns && pageWidth !== undefined ? columnZone(span, pageWidth) : "full"
    const row = rows.find(
      (candidate) =>
        candidate.zone === zone &&
        Math.abs(candidate.centerY - centerY) <= Math.max(candidate.height, span.height) * 0.75 &&
        Math.abs((candidate.spans[0]?.rotation ?? 0) - (span.rotation ?? 0)) < 12,
    )
    if (row) row.spans.push(span)
    else rows.push({ centerY, height: span.height, zone, spans: [span] })
  }
  const lines = rows.flatMap((row) => {
    const sorted = row.spans.sort((left, right) => left.x - right.x)
    const segments: PdfTextSpan[][] = []
    for (const span of sorted) {
      const current = segments.at(-1)
      const previous = current?.at(-1)
      const gap = previous ? span.x - (previous.x + previous.width) : 0
      if (!current || gap > Math.max(24, row.height * 1.5)) segments.push([span])
      else current.push(span)
    }
    return segments.map(mergeSegment)
  })
  const repaired: PdfTextSpan[] = []
  for (const line of lines.sort((left, right) => left.y - right.y || left.x - right.x)) {
    const previous = repaired.at(-1)
    const gap = previous ? line.x - (previous.x + previous.width) : Number.POSITIVE_INFINITY
    const sameHeadingRow =
      previous !== undefined &&
      previous.fontSize >= 12 &&
      line.fontSize >= 12 &&
      Math.abs(previous.y - line.y) <= Math.max(previous.height, line.height) * 0.75 &&
      gap >= -4 &&
      gap <= 10 &&
      (previous.fontWeight >= 600 || /^\d+(?:\.\d+)*\.?\s/u.test(previous.text))
    if (sameHeadingRow) repaired[repaired.length - 1] = mergeSegment([previous, line])
    else repaired.push(line)
  }
  return repaired
}
