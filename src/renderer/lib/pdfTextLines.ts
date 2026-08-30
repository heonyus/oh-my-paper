import type { PdfTextSpan } from "./pdfFeatureDetection"

type VisualRow = {
  readonly centerY: number
  readonly height: number
  readonly spans: PdfTextSpan[]
}

export function normalizeExtractedPdfText(value: string): string {
  return value
    .replace(/\b([A-Z])\s+(?=[A-Z]{2,}\b)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim()
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
  for (const span of [...spans].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const centerY = span.y + span.height / 2
    const row = rows.find(
      (candidate) =>
        Math.abs(candidate.centerY - centerY) <= Math.max(candidate.height, span.height) * 0.75 &&
        Math.abs((candidate.spans[0]?.rotation ?? 0) - (span.rotation ?? 0)) < 12,
    )
    if (row) row.spans.push(span)
    else rows.push({ centerY, height: span.height, spans: [span] })
  }
  const lines = rows.flatMap((row) => {
    const sorted = row.spans.sort((left, right) => left.x - right.x)
    const segments: PdfTextSpan[][] = []
    for (const span of sorted) {
      const current = segments.at(-1)
      const previous = current?.at(-1)
      const gap = previous ? span.x - (previous.x + previous.width) : 0
      const crossesGutter =
        previous !== undefined &&
        pageWidth !== undefined &&
        previous.x < pageWidth * 0.43 &&
        previous.x + previous.width <= pageWidth * 0.57 &&
        span.x >= pageWidth * 0.46 &&
        gap >= -pageWidth * 0.02 &&
        (previous.text.trim().length >= 12 || span.text.trim().length >= 12)
      const smallerChartLabel =
        previous !== undefined &&
        pageWidth !== undefined &&
        previous.text.trim().length >= 24 &&
        previous.fontSize >= span.fontSize * 1.55 &&
        previous.x < pageWidth / 2 &&
        span.x >= pageWidth / 2
      if (!current || gap > Math.max(18, row.height * 1.35) || crossesGutter || smallerChartLabel)
        segments.push([span])
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
