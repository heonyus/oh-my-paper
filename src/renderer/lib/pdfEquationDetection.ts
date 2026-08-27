import type { PdfFeature, PdfTextSpan } from "./pdfFeatureDetection"
import { featureRectForSpan } from "./pdfFeatureRegions"

function wordCount(text: string): number {
  return text.match(/[A-Za-z]{3,}/gu)?.length ?? 0
}

function hasMath(text: string): boolean {
  return /[=∑∫√≤≥±≈∼~πθσμφ∆∪]|\b[A-Za-z]_\w+/u.test(text)
}

function equationNumber(text: string): string | null {
  return text.trim().match(/^\((\d{1,3}(?:\.\d+)?)\)$/u)?.[1] ?? null
}

function trailingNumber(text: string): string | null {
  if (!hasMath(text) || wordCount(text) >= 12) return null
  return text.trim().match(/\((\d{1,3}(?:\.\d+)?)\)\s*$/u)?.[1] ?? null
}

function sameColumn(candidate: PdfTextSpan, numberSpan: PdfTextSpan, pageWidth: number): boolean {
  const numberCenter = numberSpan.x + numberSpan.width / 2
  const candidateCenter = candidate.x + candidate.width / 2
  if (numberCenter > pageWidth * 0.66) return candidateCenter >= pageWidth * 0.35
  if (numberCenter < pageWidth * 0.55) return candidateCenter < pageWidth * 0.65
  return true
}

function isDisplayMath(span: PdfTextSpan): boolean {
  const text = span.text.trim()
  const words = wordCount(text)
  if (!hasMath(text) || words >= 4) return false
  return !(/[:;]$/u.test(text) && words >= 1)
}

function nearestNumberId(
  span: PdfTextSpan,
  numbers: readonly PdfTextSpan[],
  pageWidth: number,
): string | null {
  const centerY = span.y + span.height / 2
  const nearest = numbers
    .filter((number) => sameColumn(span, number, pageWidth))
    .sort(
      (left, right) =>
        Math.abs(left.y + left.height / 2 - centerY) -
        Math.abs(right.y + right.height / 2 - centerY),
    )[0]
  return nearest?.id ?? null
}

function unionFeature(
  spans: readonly PdfTextSpan[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  number: string,
): PdfFeature {
  const rects = spans.map((span) => featureRectForSpan(span, pageWidth, pageHeight))
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return {
    kind: "equation",
    pageNumber,
    rect: { x, y, width: right - x, height: bottom - y },
    label: `Equation (${number})`,
    context: spans
      .map((span) => span.text)
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim(),
    priority: 0.7,
    sourceSpanIds: spans.map((span) => span.id),
  }
}

export function detectDisplayEquations(
  spans: readonly PdfTextSpan[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  excluded: ReadonlySet<string> = new Set(),
): readonly PdfFeature[] {
  const used = new Set<string>()
  const features: PdfFeature[] = []
  const numberSpans = spans.filter((span) => equationNumber(span.text) !== null)
  for (const numberSpan of numberSpans) {
    if (excluded.has(numberSpan.id)) continue
    const number = equationNumber(numberSpan.text)
    if (!number) continue
    const numberMid = numberSpan.y + numberSpan.height / 2
    const math = spans.filter(
      (span) =>
        span.id !== numberSpan.id &&
        !excluded.has(span.id) &&
        span.x < numberSpan.x &&
        Math.abs(span.y + span.height / 2 - numberMid) <= Math.max(48, numberSpan.height * 4) &&
        sameColumn(span, numberSpan, pageWidth) &&
        nearestNumberId(span, numberSpans, pageWidth) === numberSpan.id &&
        isDisplayMath(span),
    )
    if (math.length === 0) continue
    const parts = [...math].sort((left, right) => left.y - right.y || left.x - right.x)
    parts.push(numberSpan)
    features.push(unionFeature(parts, pageNumber, pageWidth, pageHeight, number))
    for (const part of parts) used.add(part.id)
  }
  for (const span of spans) {
    if (used.has(span.id) || excluded.has(span.id)) continue
    const number = trailingNumber(span.text)
    if (!number) continue
    features.push(unionFeature([span], pageNumber, pageWidth, pageHeight, number))
  }
  return features
}
