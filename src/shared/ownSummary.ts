import { z } from "zod"
import { type DocumentId, documentIdSchema } from "./ids"

/** The reader's three lines follow the AI three-line summary's 문제/방법/결과 order. */
export const ownSummaryLineSchema = z.enum(["problem", "method", "result"])
export const OWN_SUMMARY_LINES = ownSummaryLineSchema.options
export const OWN_SUMMARY_LINE_MAX_CHARACTERS = 300
export const OWN_SUMMARIES_MAX = 5_000

const lineTextSchema = z.string().max(OWN_SUMMARY_LINE_MAX_CHARACTERS)

export const ownSummaryVerdictSchema = z.enum(["match", "missing", "diverges", "unverifiable"])

/** One line's check against the paper; a verdict other than unverifiable carries its quote. */
export const ownSummaryCheckItemSchema = z.object({
  line: ownSummaryLineSchema,
  verdict: ownSummaryVerdictSchema,
  note: z.string().trim().min(1).max(400),
  page: z.number().int().positive().nullable(),
  quote: z.string().trim().min(1).max(400).nullable(),
})

export const ownSummaryCheckSchema = z.object({
  checkedAt: z.string().datetime(),
  items: z.array(ownSummaryCheckItemSchema).max(OWN_SUMMARY_LINES.length),
})

/**
 * The reader's own three-line summary of one paper. The AI overview stays closed until the
 * reader submits or skips; `afterReveal` records lines written once the overview was shown.
 */
export const ownSummarySchema = z.object({
  documentId: documentIdSchema,
  status: z.enum(["draft", "submitted", "skipped"]),
  afterReveal: z.boolean().default(false),
  lines: z.object({ problem: lineTextSchema, method: lineTextSchema, result: lineTextSchema }),
  check: ownSummaryCheckSchema.optional(),
  updatedAt: z.string().datetime(),
})

export type OwnSummaryLine = z.infer<typeof ownSummaryLineSchema>
export type OwnSummaryVerdict = z.infer<typeof ownSummaryVerdictSchema>
export type OwnSummaryCheckItem = z.infer<typeof ownSummaryCheckItemSchema>
export type OwnSummaryCheck = z.infer<typeof ownSummaryCheckSchema>
export type OwnSummary = z.infer<typeof ownSummarySchema>
export type OwnSummaryLines = OwnSummary["lines"]

export const emptyOwnSummaryLines: OwnSummaryLines = { problem: "", method: "", result: "" }

export function ownSummaryRevealed(summary: OwnSummary | undefined): boolean {
  if (!summary) return false
  return summary.status !== "draft" || summary.afterReveal
}

function sameOwnSummary(left: OwnSummary | undefined, right: OwnSummary | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Three-way merge keyed by document: a record the incoming side changed since the base wins;
 * otherwise the current side is kept, so a stale writer cannot undo newer lines.
 */
export function mergeOwnSummaries(
  base: readonly OwnSummary[],
  current: readonly OwnSummary[],
  incoming: readonly OwnSummary[],
): readonly OwnSummary[] {
  const baseById = new Map(base.map((summary) => [summary.documentId, summary]))
  const incomingById = new Map(incoming.map((summary) => [summary.documentId, summary]))
  const result = new Map<DocumentId, OwnSummary>(
    current.map((summary) => [summary.documentId, summary]),
  )
  for (const [documentId, summary] of incomingById) {
    if (!sameOwnSummary(baseById.get(documentId), summary)) result.set(documentId, summary)
  }
  for (const [documentId, summary] of baseById) {
    if (incomingById.has(documentId)) continue
    if (sameOwnSummary(result.get(documentId), summary)) result.delete(documentId)
  }
  return [...result.values()]
}
