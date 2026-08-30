import type { PdfFeatureRect } from "./pdfFeatureDetection"

export type ScoredFigureRect = {
  readonly rect: PdfFeatureRect
  readonly ownershipScore: number
}

function verticalOverlapRatio(left: PdfFeatureRect, right: PdfFeatureRect): number {
  const overlap = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return overlap / Math.max(1, Math.min(left.height, right.height))
}

function horizontalOverlapRatio(left: PdfFeatureRect, right: PdfFeatureRect): number {
  const overlap = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  return overlap / Math.max(1, Math.min(left.width, right.width))
}

function unionRects(rects: readonly PdfFeatureRect[]): PdfFeatureRect {
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x, y, width: right - x, height: bottom - y }
}

function rowsFor(
  candidates: readonly ScoredFigureRect[],
): readonly (readonly ScoredFigureRect[])[] {
  const rows: ScoredFigureRect[][] = []
  for (const candidate of [...candidates].sort((left, right) => left.rect.y - right.rect.y)) {
    const row = rows.find((current) =>
      current.some((member) => verticalOverlapRatio(member.rect, candidate.rect) >= 0.6),
    )
    if (row) row.push(candidate)
    else rows.push([candidate])
  }
  return rows.map((row) => [...row].sort((left, right) => left.rect.x - right.rect.x))
}

function isAlignedPanelGrid(rows: readonly (readonly ScoredFigureRect[])[]): boolean {
  if (rows.length < 2 || rows.some((row) => row.length < 2)) return false
  const envelopes = rows.map((row) => unionRects(row.map((candidate) => candidate.rect)))
  for (let index = 1; index < envelopes.length; index += 1) {
    const previous = envelopes[index - 1]
    const current = envelopes[index]
    if (!previous || !current) return false
    const gap = current.y - (previous.y + previous.height)
    const permittedGap = Math.max(24, Math.min(previous.height, current.height) * 0.5)
    if (gap > permittedGap || horizontalOverlapRatio(previous, current) < 0.65) return false
  }
  return true
}

function bestRow(rows: readonly (readonly ScoredFigureRect[])[]): readonly ScoredFigureRect[] {
  return (
    [...rows].sort((left, right) => {
      const leftScore = Math.max(...left.map((candidate) => candidate.ownershipScore))
      const rightScore = Math.max(...right.map((candidate) => candidate.ownershipScore))
      return rightScore - leftScore
    })[0] ?? []
  )
}

export function selectFigureGroup(
  candidates: readonly ScoredFigureRect[],
): readonly PdfFeatureRect[] {
  const rows = rowsFor(candidates)
  const selected = isAlignedPanelGrid(rows) ? rows.flat() : bestRow(rows)
  return selected.map((candidate) => candidate.rect)
}
