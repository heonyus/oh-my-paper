import {
  MEMORY_RETRIEVAL_LIMITS,
  type MemoryRecord,
  type MemoryRetrievalQuery,
  type MemoryRetrievalResult,
  memoryRetrievalQuerySchema,
} from "../shared/memorySchemas"

export function estimateConservativeTokens(text: string): number {
  return Math.max(1, Math.ceil(Array.from(text).length / 2))
}

export function selectApprovedMemories(
  candidates: readonly MemoryRecord[],
  rawQuery: MemoryRetrievalQuery,
): MemoryRetrievalResult {
  const query = memoryRetrievalQuerySchema.parse(rawQuery)
  const terms = query.terms.map((term) => term.toLocaleLowerCase()).filter(Boolean)
  const applicable = candidates.filter(
    (record) => record.state === "accepted" && sameScope(record.scope, query.scope),
  )
  const ranked = applicable
    .map((record) => ({ record, score: relevance(record, terms) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return right.record.updatedAt.localeCompare(left.record.updatedAt)
    })

  const records: MemoryRecord[] = []
  let conservativeTokenCount = 0
  for (const item of ranked) {
    if (records.length >= MEMORY_RETRIEVAL_LIMITS.maxEntries) break
    const nextTotal = conservativeTokenCount + item.record.conservativeTokenEstimate
    if (nextTotal > MEMORY_RETRIEVAL_LIMITS.maxConservativeTokens) continue
    records.push(item.record)
    conservativeTokenCount = nextTotal
  }

  return {
    records,
    conservativeTokenCount,
    omittedCount: Math.max(0, applicable.length - records.length),
  }
}

function sameScope(left: MemoryRecord["scope"], right: MemoryRetrievalQuery["scope"]): boolean {
  return left.kind === right.kind && left.key === right.key
}

function relevance(record: MemoryRecord, terms: readonly string[]): number {
  if (terms.length === 0) return 1
  const haystack = [record.text, ...record.evidence.map((item) => item.quote ?? "")]
    .join(" ")
    .toLocaleLowerCase()
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 2 : 0), 0)
}
