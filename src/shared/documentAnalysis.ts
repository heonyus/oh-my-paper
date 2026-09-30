import { z } from "zod"
import { documentPageParseStageSchema } from "./documentPageModel"
import { documentIdSchema } from "./schemas"

const documentAnalysisBaseSchema = z.object({
  id: documentIdSchema,
  title: z.string().trim().min(1).max(512),
  pageCount: z.number().int().positive(),
})

export const documentAnalysisJobSchema = z.discriminatedUnion("state", [
  documentAnalysisBaseSchema.extend({
    state: z.literal("queued"),
    completedPages: z.number().int().nonnegative(),
    /** Why it waits, when it is not just its turn (the OCR engine still downloading). */
    message: z.string().trim().min(1).max(300).optional(),
  }),
  documentAnalysisBaseSchema.extend({
    state: z.literal("running"),
    completedPages: z.number().int().nonnegative(),
    currentPage: z.number().int().positive(),
    stage: documentPageParseStageSchema,
    engine: z.enum(["local", "mistral"]),
    attempt: z.number().int().positive(),
    maxAttempts: z.number().int().positive(),
  }),
  documentAnalysisBaseSchema.extend({
    state: z.literal("complete"),
    completedPages: z.number().int().positive(),
  }),
  documentAnalysisBaseSchema.extend({
    state: z.literal("failed"),
    completedPages: z.number().int().nonnegative(),
    message: z.string().trim().min(1).max(300),
  }),
])

/** Jobs a snapshot lists in full; the rest are only counted, so a whole library can queue. */
export const DOCUMENT_ANALYSIS_LISTED_JOBS = 64

const jobCountSchema = z.number().int().nonnegative()

export const documentAnalysisSnapshotSchema = z
  .object({
    /** Running jobs first, then failed, queued and complete ones, up to the listed bound. */
    jobs: z.array(documentAnalysisJobSchema).max(DOCUMENT_ANALYSIS_LISTED_JOBS).readonly(),
    /** Unfinished jobs beyond `jobs`, by state. */
    unlisted: z
      .object({ queued: jobCountSchema, running: jobCountSchema, failed: jobCountSchema })
      .readonly(),
  })
  .readonly()
export const documentAnalysisRequestSchema = z.object({ id: documentIdSchema })

export type DocumentAnalysisJob = z.infer<typeof documentAnalysisJobSchema>
export type DocumentAnalysisSnapshot = z.infer<typeof documentAnalysisSnapshotSchema>

export const emptyDocumentAnalysisSnapshot: DocumentAnalysisSnapshot = {
  jobs: [],
  unlisted: { queued: 0, running: 0, failed: 0 },
}

/** The snapshot of `jobs`, however many: the first of each state listed, the rest counted. */
export function snapshotOfAnalysisJobs(
  jobs: Iterable<DocumentAnalysisJob>,
): DocumentAnalysisSnapshot {
  const limit = DOCUMENT_ANALYSIS_LISTED_JOBS
  const listed: Record<DocumentAnalysisJob["state"], DocumentAnalysisJob[]> = {
    running: [],
    failed: [],
    queued: [],
    complete: [],
  }
  const totals = { queued: 0, running: 0, failed: 0 }
  for (const job of jobs) {
    if (job.state !== "complete") totals[job.state] += 1
    if (listed[job.state].length < limit) listed[job.state].push(job)
  }
  const shown = [...listed.running, ...listed.failed, ...listed.queued, ...listed.complete].slice(
    0,
    limit,
  )
  const count = (state: keyof typeof totals): number =>
    totals[state] - shown.filter((job) => job.state === state).length
  return documentAnalysisSnapshotSchema.parse({
    jobs: shown,
    unlisted: { queued: count("queued"), running: count("running"), failed: count("failed") },
  })
}

/** Whether any job, listed or only counted, is still queued or running. */
export function hasActiveAnalysis(snapshot: DocumentAnalysisSnapshot): boolean {
  if (snapshot.unlisted.queued > 0 || snapshot.unlisted.running > 0) return true
  return snapshot.jobs.some((job) => job.state === "queued" || job.state === "running")
}
