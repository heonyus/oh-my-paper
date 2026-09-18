import { z } from "zod"
import { type DocumentId, documentIdSchema } from "./schemas"

export const aiPolicy = {
  concurrentJobs: 3,
  concurrentVisionJobs: 1,
  concurrentTextJobs: 2,
  structureJobs: 20,
  structureBudgetUsd: 0.5,
  sessionRequests: 64,
  sessionInputTokens: 250_000,
  sessionOutputTokens: 32_000,
  sessionBudgetUsd: 2,
  decodedImageBytes: 4 * 1024 * 1024,
  imageLongestEdge: 2_048,
  translationCharacters: 12_000,
  translationOutputTokens: 2_048,
  readerCharacters: 24_000,
  readerOutputTokens: 2_048,
  citationCharacters: 8_000,
  citationOutputTokens: 768,
  cancellationAcknowledgementMs: 250,
} as const

const jobIdSchema = z
  .string()
  .regex(/^job:[a-zA-Z0-9._-]+$/)
  .brand("AiJobId")
export const aiJobIdSchema = jobIdSchema
const sourceGenerationSchema = z.number().int().nonnegative()
export const sourceGenerationNumberSchema = sourceGenerationSchema

export const aiPrioritySchema = z.enum(["current", "adjacent", "prerequisite", "background"])
export const aiPoolSchema = z.enum(["local", "remote_text", "remote_vision"])
export const aiRoleSchema = z.enum(["structure", "reader", "translation", "citation"])
export const aiCapabilitySnapshotSchema = z
  .object({
    provider: z.enum(["openai", "openrouter", "opencodex"]),
    model: z.string().min(1).max(160),
    metadataVersion: z.string().min(1).max(160),
    inputModality: z.enum(["text", "image"]),
    structured: z.boolean(),
    pricingKnown: z.boolean(),
  })
  .strict()
export const aiJobErrorCodeSchema = z.enum([
  "auth",
  "rate_limited",
  "timeout",
  "privacy_denied",
  "unsupported_capability",
  "malformed_output",
  "provider_error",
  "cancelled",
  "dependency_failed",
  "budget_paused",
  "queue_full",
  "stale_generation",
])
const translationInputSchema = z.object({
  characterCount: z.number().int().nonnegative().max(aiPolicy.translationCharacters),
  outputTokens: z.number().int().positive().max(aiPolicy.translationOutputTokens),
})
const readerInputSchema = z.object({
  characterCount: z.number().int().nonnegative().max(aiPolicy.readerCharacters),
  outputTokens: z.number().int().positive().max(aiPolicy.readerOutputTokens),
})
const citationInputSchema = z.object({
  characterCount: z.number().int().nonnegative().max(aiPolicy.citationCharacters),
  outputTokens: z.number().int().positive().max(aiPolicy.citationOutputTokens),
})
const structureInputSchema = z.object({
  decodedImageBytes: z.number().int().positive().max(aiPolicy.decodedImageBytes),
  longestEdge: z.number().int().positive().max(aiPolicy.imageLongestEdge),
})
const jobMetadataFields = {
  documentId: documentIdSchema.optional(),
  parentIds: z.array(jobIdSchema).max(16).default([]),
  priority: aiPrioritySchema.default("background"),
  pool: aiPoolSchema.default("remote_text"),
  capabilitySnapshot: aiCapabilitySnapshotSchema.optional(),
  cacheKey: z.string().min(1).max(512).optional(),
}

export const aiJobSchema = z.discriminatedUnion("role", [
  z.object({
    ...jobMetadataFields,
    id: jobIdSchema,
    role: z.literal("structure"),
    sourceGeneration: sourceGenerationSchema,
    input: structureInputSchema,
  }),
  z.object({
    ...jobMetadataFields,
    id: jobIdSchema,
    role: z.literal("reader"),
    sourceGeneration: sourceGenerationSchema,
    input: readerInputSchema,
  }),
  z.object({
    ...jobMetadataFields,
    id: jobIdSchema,
    role: z.literal("translation"),
    sourceGeneration: sourceGenerationSchema,
    input: translationInputSchema,
  }),
  z.object({
    ...jobMetadataFields,
    id: jobIdSchema,
    role: z.literal("citation"),
    sourceGeneration: sourceGenerationSchema,
    input: citationInputSchema,
  }),
])

export const aiJobEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("started"),
    jobId: jobIdSchema,
    sequence: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("delta"),
    jobId: jobIdSchema,
    sequence: z.number().int().nonnegative(),
    contentLength: z.number().int().nonnegative(),
    delta: z.string().max(32_000).optional(),
  }),
  z.object({
    kind: z.literal("completed"),
    jobId: jobIdSchema,
    sequence: z.number().int().nonnegative(),
    usageTokens: z.number().int().nonnegative().nullable(),
    model: z.string().min(1).max(160).optional(),
    text: z.string().min(1).max(32_000),
  }),
  z.object({
    kind: z.literal("failed"),
    jobId: jobIdSchema,
    sequence: z.number().int().nonnegative(),
    code: aiJobErrorCodeSchema,
    retryable: z.boolean(),
    sourceGeneration: sourceGenerationSchema.optional(),
  }),
  z.object({
    kind: z.literal("cancelled"),
    jobId: jobIdSchema,
    sequence: z.number().int().nonnegative(),
  }),
])

export const aiUsageSchema = z
  .object({
    provider: z.enum(["openai", "openrouter", "opencodex"]),
    model: z.string().min(1).max(160),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
  })
  .strict()
export const aiCacheKeySchema = z.string().min(1).max(512)
export const aiJobCancelRequestSchema = z.object({ jobId: jobIdSchema }).strict()
export const aiJobCancelAckSchema = z.object({ jobId: jobIdSchema, accepted: z.boolean() }).strict()
export const aiJobFailureSchema = z
  .object({ code: aiJobErrorCodeSchema, retryable: z.boolean() })
  .strict()

export type AiJob = z.infer<typeof aiJobSchema>
export type AiJobEvent = z.infer<typeof aiJobEventSchema>
export type AiJobId = z.infer<typeof jobIdSchema>
export type AiPriority = z.infer<typeof aiPrioritySchema>
export type AiPool = z.infer<typeof aiPoolSchema>
export type AiRole = z.infer<typeof aiRoleSchema>
export type AiJobErrorCode = z.infer<typeof aiJobErrorCodeSchema>
export type AiCapabilitySnapshot = z.infer<typeof aiCapabilitySnapshotSchema>
export type AiUsage = z.infer<typeof aiUsageSchema>

export type AiScheduledJob = {
  readonly id: AiJobId
  readonly documentId: DocumentId
  readonly sourceGeneration: number
  readonly parents: readonly AiJobId[]
  readonly priority: AiPriority
  readonly pool: AiPool
}

export function createAiJobId(value: string): AiJobId {
  return jobIdSchema.parse(value)
}
