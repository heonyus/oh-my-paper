import type { PdfFeature, PdfFeatureRect } from "./pdfFeatureDetection"

function unionRect(left: PdfFeatureRect, right: PdfFeatureRect): PdfFeatureRect {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const farRight = Math.max(left.x + left.width, right.x + right.width)
  const bottom = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: farRight - x, height: bottom - y }
}

function equationNumbers(label: string): readonly number[] {
  return Array.from(label.matchAll(/\((\d+)\)/gu), (match) => Number(match[1]))
}

function canMerge(left: PdfFeature, right: PdfFeature, pageWidth: number): boolean {
  if (left.kind !== "equation" || right.kind !== "equation") return false
  const leftNumbers = equationNumbers(left.label)
  const rightNumbers = equationNumbers(right.label)
  const leftNumber = leftNumbers.at(-1)
  const rightNumber = rightNumbers[0]
  if (leftNumber === undefined || rightNumber !== leftNumber + 1) return false
  const gap = right.rect.y - (left.rect.y + left.rect.height)
  const maxHeight = Math.max(left.rect.height, right.rect.height)
  const overlap =
    Math.min(left.rect.x + left.rect.width, right.rect.x + right.rect.width) -
    Math.max(left.rect.x, right.rect.x)
  const minWidth = Math.min(left.rect.width, right.rect.width)
  const centerDelta = Math.abs(
    left.rect.x + left.rect.width / 2 - (right.rect.x + right.rect.width / 2),
  )
  return (
    gap >= -maxHeight * 0.35 &&
    gap <= Math.max(10, maxHeight * 0.85) &&
    (overlap >= minWidth * 0.55 || centerDelta <= pageWidth * 0.08)
  )
}

function merge(left: PdfFeature, right: PdfFeature): PdfFeature {
  const start = equationNumbers(left.label)[0]
  const end = equationNumbers(right.label).at(-1)
  if (start === undefined || end === undefined) return left
  return {
    ...left,
    rect: unionRect(left.rect, right.rect),
    label: `Equations (${start})–(${end})`,
    context: `${left.context}\n${right.context}`,
    priority: Math.max(left.priority, right.priority),
    sourceSpanIds: [...left.sourceSpanIds, ...right.sourceSpanIds],
  }
}

export function mergeAdjacentEquations(
  features: readonly PdfFeature[],
  pageWidth: number,
): readonly PdfFeature[] {
  const merged: PdfFeature[] = []
  for (const feature of features) {
    const previous = merged.at(-1)
    if (previous && canMerge(previous, feature, pageWidth)) {
      merged[merged.length - 1] = merge(previous, feature)
    } else merged.push(feature)
  }
  return merged
}
