import type {
  ScholarlyGraphArticle,
  ScholarlyGraphDirection,
  ScholarlyGraphEdge,
  ScholarlyGraphResult,
} from "../../../shared/scholarlyGraphSchemas"
import type { ScholarlySearchItem } from "../../../shared/scholarlySearchSchemas"

export const SCHOLARLY_GRAPH_VIEWBOX = { width: 1200, height: 720 } as const
export const SCHOLARLY_GRAPH_HISTORY_LIMIT = 10

export interface ScholarlyGraphPoint {
  readonly x: number
  readonly y: number
}

export interface GraphHistoryEntry {
  readonly seedId: string
  readonly selectedId: string
  readonly result: ScholarlyGraphResult
}

export function directionLabel(direction: ScholarlyGraphDirection): string {
  switch (direction) {
    case "references":
      return "참고문헌"
    case "cited_by":
      return "피인용"
    case "related":
      return "관련"
  }
}

export function graphArticleKey(article: ScholarlyGraphArticle): string {
  return article.id
}

export function graphArticleToSearchItem(article: ScholarlyGraphArticle): ScholarlySearchItem {
  const openAlexId = article.id.split("/").at(-1) ?? article.id
  return {
    provider: "openalex",
    identity: {
      providerRecordId: openAlexId,
      doi: article.doi,
      arxivId: null,
      openAlexId,
    },
    title: article.title,
    authors: article.authors,
    year: article.year,
    venue: "",
    abstract: article.abstract,
    landingUrl: article.sourceUrl,
    citationCount: article.citationCount,
    access: {
      metadata: "available",
      abstract: article.abstract ? "available" : "unavailable",
      fullText: article.sourceUrl
        ? { state: "link_only", url: article.sourceUrl }
        : { state: "unavailable", url: null },
    },
  }
}

export function axisAvailability(nodes: readonly ScholarlyGraphArticle[]): {
  readonly year: boolean
  readonly citationCount: boolean
} {
  return {
    year: nodes.filter((node) => node.year !== null).length >= 2,
    citationCount: nodes.filter((node) => node.citationCount !== null).length >= 2,
  }
}

function scale(value: number, min: number, max: number, size: number, padding: number): number {
  if (min === max) return size / 2
  return padding + ((value - min) / (max - min)) * (size - padding * 2)
}

function fallbackPoint(index: number, count: number): ScholarlyGraphPoint {
  const angle = (Math.PI * 2 * index) / Math.max(count, 1) - Math.PI / 2
  return {
    x: SCHOLARLY_GRAPH_VIEWBOX.width / 2 + Math.cos(angle) * 280,
    y: SCHOLARLY_GRAPH_VIEWBOX.height / 2 + Math.sin(angle) * 220,
  }
}

function separatedPoint(
  point: ScholarlyGraphPoint,
  occupied: readonly ScholarlyGraphPoint[],
  bottom: number,
): ScholarlyGraphPoint {
  // ponytail: bounded placement targets 21 visible papers; use a spatial index if this limit grows.
  for (let ring = 0; ring < 20; ring += 1) {
    for (const [dx, dy] of [
      [0, ring * 58],
      [0, -ring * 58],
      [-ring * 108, 0],
      [ring * 108, 0],
      [-ring * 108, ring * 58],
      [ring * 108, -ring * 58],
    ]) {
      const candidate = {
        x: Math.max(100, Math.min(1100, point.x + (dx ?? 0))),
        y: Math.max(80, Math.min(bottom, point.y + (dy ?? 0))),
      }
      if (
        !occupied.some(
          (other) => Math.abs(other.x - candidate.x) < 104 && Math.abs(other.y - candidate.y) < 54,
        )
      )
        return candidate
    }
  }
  return point
}

export function graphPositions(
  result: ScholarlyGraphResult,
  rootId: string,
): ReadonlyMap<string, ScholarlyGraphPoint> {
  const positions = new Map<string, ScholarlyGraphPoint>()
  const axis = axisAvailability(result.nodes)
  const unknownNodes =
    axis.year || axis.citationCount
      ? result.nodes.filter((node) => node.year === null || node.citationCount === null)
      : []
  const plotBottom = 640 - Math.ceil(unknownNodes.length / 8) * 64
  const years = result.nodes.flatMap((node) => (node.year === null ? [] : [node.year]))
  const counts = result.nodes.flatMap((node) =>
    node.citationCount === null ? [] : [Math.log1p(node.citationCount)],
  )
  const yearMin = years.length > 0 ? Math.min(...years) : 0
  const yearMax = years.length > 0 ? Math.max(...years) : 1
  const countMin = counts.length > 0 ? Math.min(...counts) : 0
  const countMax = counts.length > 0 ? Math.max(...counts) : 1
  const fallbackNodes = result.nodes.filter(
    (node) => node.id !== rootId && (axis.year ? node.year === null : true),
  )
  result.nodes.forEach((node, index) => {
    const unknownIndex = unknownNodes.findIndex((unknown) => unknown.id === node.id)
    if (unknownIndex >= 0) {
      positions.set(node.id, {
        x: 140 + (unknownIndex % 8) * 130,
        y: plotBottom + 52 + Math.floor(unknownIndex / 8) * 64,
      })
      return
    }
    const fallbackIndex = fallbackNodes.findIndex((candidate) => candidate.id === node.id)
    const fallback = fallbackPoint(fallbackIndex < 0 ? index : fallbackIndex, fallbackNodes.length)
    const point = {
      x:
        axis.year && node.year !== null
          ? scale(node.year, yearMin, yearMax, SCHOLARLY_GRAPH_VIEWBOX.width, 90)
          : axis.year
            ? 48
            : fallback.x,
      y:
        axis.citationCount && node.citationCount !== null
          ? plotBottom +
            80 -
            scale(Math.log1p(node.citationCount), countMin, countMax, plotBottom + 80, 80)
          : axis.citationCount
            ? SCHOLARLY_GRAPH_VIEWBOX.height - 24
            : fallback.y,
    }
    positions.set(node.id, separatedPoint(point, [...positions.values()], plotBottom))
  })
  return positions
}

export function edgeIsAdjacent(edge: ScholarlyGraphEdge, selectedId: string): boolean {
  return edge.sourceId === selectedId || edge.targetId === selectedId
}

export function pushGraphHistory(
  history: readonly GraphHistoryEntry[],
  next: GraphHistoryEntry,
): readonly GraphHistoryEntry[] {
  const previous = history.at(-1)
  if (
    previous?.seedId === next.seedId &&
    previous.selectedId === next.selectedId &&
    previous.result === next.result
  )
    return history
  return [...history, next].slice(-SCHOLARLY_GRAPH_HISTORY_LIMIT)
}
