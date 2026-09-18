import { z } from "zod"
import { knowledgeNodeIdSchema } from "./knowledgeSchemas"
import {
  researchRequestIdSchema,
  researchSourceIdSchema,
  researchSourceSchema,
  webDiscoveryResultSchema,
} from "./researchSourceSchemas"

export const researchJobIdSchema = z.string().uuid().brand("ResearchJobId")

export const researchBudgetsSchema = z
  .object({
    searchRounds: z.number().int().min(1).max(10).default(5),
    sources: z.number().int().min(1).max(50).default(20),
    minutes: z.number().int().min(1).max(60).default(15),
    modelTurns: z.number().int().min(1).max(50).default(20),
  })
  .readonly()

export const defaultResearchBudgets = researchBudgetsSchema.parse({})

export const researchPreviewInputSchema = z
  .object({
    question: z.string().trim().min(1).max(1_000),
    provider: z.literal("codex_subscription"),
    scope: z
      .object({
        external: z.boolean(),
        localSourceIds: z.array(knowledgeNodeIdSchema).max(20).readonly(),
      })
      .refine(({ external, localSourceIds }) => external || localSourceIds.length > 0, {
        message: "At least one research source scope is required",
      })
      .readonly(),
    budgets: researchBudgetsSchema.default(defaultResearchBudgets),
  })
  .readonly()

export const researchJobStatusSchema = z.enum([
  "awaiting_start",
  "running",
  "paused",
  "cancelled",
  "failed",
  "completed",
])

export const researchJobPhaseSchema = z.enum([
  "preview",
  "loading_local",
  "searching",
  "retrieving",
  "synthesizing",
  "report_ready",
  "saving",
  "saved",
])

export const researchPauseReasonSchema = z.enum([
  "budget_reached",
  "time_reached",
  "authentication_required",
  "quota_reached",
  "network_lost",
  "search_unavailable",
  "restart_unknown_outcome",
])

const requestLogSchema = z
  .object({
    id: researchRequestIdSchema,
    kind: z.enum(["local_read", "search", "source_fetch", "model"]),
    state: z.enum(["pending", "succeeded", "failed", "unknown_outcome"]),
    providerRequestId: z.string().min(1).max(500).nullable().default(null),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .readonly()

const researchCountsSchema = z
  .object({
    searchRounds: z.number().int().nonnegative(),
    sourcesAttempted: z.number().int().nonnegative(),
    sourcesRetrieved: z.number().int().nonnegative(),
    modelTurns: z.number().int().nonnegative(),
  })
  .readonly()

export const researchModelDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("refine"), query: z.string().trim().min(1).max(1_000) }).readonly(),
  z
    .object({
      kind: z.literal("report"),
      title: z.string().trim().min(1).max(500),
      markdown: z
        .string()
        .min(1)
        .max(2 * 1024 * 1024),
      sourceIds: z.array(researchSourceIdSchema).max(50).readonly(),
    })
    .readonly(),
])

export const researchCitationSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    expectedContentHash: z.string().max(256).nullable(),
    url: z.string().url(),
    page: z.number().int().positive().nullable(),
    snippet: z.string().max(16_000).nullable(),
    accessLabel: z.enum(["metadata-only", "full-text excerpt", "PDF binary only"]),
  })
  .readonly()

export const researchReportDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    markdown: z
      .string()
      .min(1)
      .max(2 * 1024 * 1024),
    citations: z.array(researchCitationSchema).max(50).readonly(),
    partial: z.boolean(),
  })
  .readonly()

const researchCheckpointSchema = z
  .object({
    localSourceIndex: z.number().int().nonnegative(),
    searchComplete: z.boolean(),
    nextSourceIndex: z.number().int().nonnegative(),
  })
  .readonly()

export const researchJobSnapshotSchema = z
  .object({
    id: researchJobIdSchema,
    input: researchPreviewInputSchema,
    status: researchJobStatusSchema,
    phase: researchJobPhaseSchema,
    pauseReason: researchPauseReasonSchema.nullable(),
    error: z.string().max(2_000).nullable(),
    counts: researchCountsSchema,
    sources: z.array(researchSourceSchema).max(50).readonly(),
    discoveredSources: z.array(webDiscoveryResultSchema).max(50).readonly(),
    requests: z.array(requestLogSchema).max(160).readonly(),
    checkpoint: researchCheckpointSchema,
    nextQuery: z.string().max(1_000).nullable(),
    report: researchReportDraftSchema.nullable(),
    reportNodeId: knowledgeNodeIdSchema.nullable(),
    providerUsage: z.discriminatedUnion("state", [
      z.object({ state: z.literal("unknown") }).readonly(),
      z
        .object({
          state: z.literal("reported"),
          inputTokens: z.number().int().nonnegative(),
          outputTokens: z.number().int().nonnegative(),
        })
        .readonly(),
    ]),
    warnings: z.array(z.string().max(1_000)).max(100).readonly(),
    elapsedMs: z.number().int().nonnegative(),
    activeSince: z.string().datetime().nullable(),
    startedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .readonly()

export type ResearchJobId = z.infer<typeof researchJobIdSchema>
export type ResearchBudgets = z.infer<typeof researchBudgetsSchema>
export type ResearchPreviewInput = z.input<typeof researchPreviewInputSchema>
export type ParsedResearchPreviewInput = z.output<typeof researchPreviewInputSchema>
export type ResearchJobStatus = z.infer<typeof researchJobStatusSchema>
export type ResearchJobPhase = z.infer<typeof researchJobPhaseSchema>
export type ResearchPauseReason = z.infer<typeof researchPauseReasonSchema>
export type ResearchModelDecision = z.infer<typeof researchModelDecisionSchema>
export type ResearchCitation = z.infer<typeof researchCitationSchema>
export type ResearchReportDraft = z.infer<typeof researchReportDraftSchema>
export type ResearchJobSnapshot = z.infer<typeof researchJobSnapshotSchema>
