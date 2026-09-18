import {
  type ScholarlyGraphDirection,
  type ScholarlyGraphEdge,
  type ScholarlyGraphRequest,
  type ScholarlyGraphResult,
  scholarlyGraphRequestSchema,
  scholarlyGraphResultSchema,
} from "../shared/scholarlyGraphSchemas"
import {
  fetchOpenAlexDirection,
  fetchOpenAlexSeed,
  type OpenAlexWork,
  ScholarlyGraphError,
  toGraphArticle,
} from "./scholarlyGraphOpenAlex"
import type { ScholarlyTransport } from "./scholarlySearchTransport"

function statusFor(results: ScholarlyGraphResult["directions"]): ScholarlyGraphResult["status"] {
  const successful = results.filter((result) => result.status === "success").length
  if (successful === results.length) return "complete"
  if (successful > 0) return "partial"
  if (results.every((result) => result.error?.kind === "cancelled")) return "cancelled"
  return "failed"
}

export async function getScholarlyGraph(
  input: ScholarlyGraphRequest,
  options: { readonly transport: ScholarlyTransport; readonly signal: AbortSignal },
): Promise<ScholarlyGraphResult> {
  const request = scholarlyGraphRequestSchema.parse(input)
  const seed = await fetchOpenAlexSeed(request, options.transport, options.signal)
  const directionResults = await Promise.all(
    request.directions.map(async (direction) => {
      try {
        const fetched = await fetchOpenAlexDirection(
          direction,
          seed,
          request.limit,
          options.transport,
          options.signal,
        )
        return { direction, fetched, status: "success" as const }
      } catch (error) {
        if (error instanceof ScholarlyGraphError)
          return { direction, status: "error" as const, error }
        throw error
      }
    }),
  )
  const nodes = new Map<string, ReturnType<typeof toGraphArticle>>([
    [seed.id, toGraphArticle(seed)],
  ])
  const visibleWorks = new Map<string, OpenAlexWork>([[seed.id, seed]])
  const edges: ScholarlyGraphEdge[] = []
  const selectedCounts = new Map<ScholarlyGraphDirection, number>()
  const processedIds = new Map<ScholarlyGraphDirection, Set<string>>()
  const cursors = new Map<ScholarlyGraphDirection, number>()
  let visibleNeighbourCount = 0
  for (const result of directionResults) {
    processedIds.set(result.direction, new Set())
    cursors.set(result.direction, 0)
    selectedCounts.set(result.direction, 0)
  }

  const addEdge = (
    sourceId: string,
    targetId: string,
    direction: ScholarlyGraphDirection,
  ): void => {
    const duplicate = edges.some(
      (edge) =>
        edge.sourceId === sourceId &&
        edge.targetId === targetId &&
        (edge.direction === direction ||
          (direction !== "related" &&
            edge.direction !== "related" &&
            (edge.direction === "references" || edge.direction === "cited_by"))),
    )
    if (!duplicate) edges.push({ sourceId, targetId, direction, provenance: "openalex" })
  }

  const includeWork = (direction: ScholarlyGraphDirection, work: OpenAlexWork): boolean => {
    if (!visibleWorks.has(work.id) && visibleNeighbourCount >= request.limit) return false
    if (!visibleWorks.has(work.id)) {
      nodes.set(work.id, toGraphArticle(work))
      visibleWorks.set(work.id, work)
      visibleNeighbourCount += 1
    }
    const sourceId = direction === "cited_by" ? work.id : seed.id
    const targetId = direction === "cited_by" ? seed.id : work.id
    addEdge(sourceId, targetId, direction)
    selectedCounts.set(direction, (selectedCounts.get(direction) ?? 0) + 1)
    return true
  }

  let progress = true
  while (progress && visibleNeighbourCount < request.limit) {
    progress = false
    for (const result of directionResults) {
      if (result.status === "error") continue
      const seen = processedIds.get(result.direction)
      const cursor = cursors.get(result.direction) ?? 0
      if (!seen) continue
      let next = cursor
      while (next < result.fetched.works.length && seen.has(result.fetched.works[next]?.id ?? "")) {
        next += 1
      }
      const work = result.fetched.works[next]
      if (!work) continue
      cursors.set(result.direction, next + 1)
      seen.add(work.id)
      progress = true
      includeWork(result.direction, work)
    }
  }

  for (const result of directionResults) {
    if (result.status === "error") {
      continue
    }
    const seen = processedIds.get(result.direction)
    if (!seen) continue
    for (const work of result.fetched.works) {
      if (seen.has(work.id)) continue
      seen.add(work.id)
      if (visibleWorks.has(work.id)) includeWork(result.direction, work)
    }
  }
  for (const work of visibleWorks.values()) {
    for (const referencedId of work.referenced_works) {
      if (!visibleWorks.has(referencedId)) continue
      addEdge(work.id, referencedId, "references")
    }
  }
  const directions = directionResults.map((result) => {
    if (result.status === "error") {
      return {
        direction: result.direction,
        status: "error" as const,
        resultCount: 0,
        totalResults: null,
        truncated: false,
        error: { kind: result.error.kind, httpStatus: result.error.httpStatus },
      }
    }
    return {
      direction: result.direction,
      status: "success" as const,
      resultCount: selectedCounts.get(result.direction) ?? 0,
      totalResults: result.fetched.total,
      truncated:
        result.fetched.total > (selectedCounts.get(result.direction) ?? 0) ||
        result.fetched.works.length > (selectedCounts.get(result.direction) ?? 0),
      error: null,
    }
  })
  const visibleEdges = edges.filter((edge) => nodes.has(edge.sourceId) && nodes.has(edge.targetId))
  const edgeTruncated = visibleEdges.length > 180
  return scholarlyGraphResultSchema.parse({
    status: statusFor(directions),
    provider: "openalex",
    seedIds: [seed.id],
    nodes: [...nodes.values()].slice(0, request.limit + 1),
    edges: visibleEdges.slice(0, 180),
    directions,
    truncated: edgeTruncated || directions.some(({ truncated }) => truncated),
  })
}
