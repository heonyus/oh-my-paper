import { z } from "zod"

export const scholarlyGraphDirectionSchema = z.enum(["references", "cited_by", "related"])
export const scholarlyGraphDirections = scholarlyGraphDirectionSchema.options

export const scholarlyGraphSeedSchema = z
  .object({
    openAlexId: z.string().trim().min(1).max(200).nullable().optional(),
    doi: z.string().trim().min(1).max(300).nullable().optional(),
  })
  .refine(({ openAlexId, doi }) => Boolean(openAlexId || doi), {
    message: "A seed OpenAlex ID or DOI is required",
  })
  .readonly()

export const scholarlyGraphRequestSchema = z
  .object({
    seed: scholarlyGraphSeedSchema,
    directions: z
      .array(scholarlyGraphDirectionSchema)
      .min(1)
      .max(3)
      .refine((values) => new Set(values).size === values.length, "directions must be unique")
      .default(scholarlyGraphDirections)
      .readonly(),
    limit: z.number().int().min(1).max(60).default(20),
  })
  .readonly()

export const scholarlyGraphArticleSchema = z
  .object({
    id: z.string().url(),
    provider: z.literal("openalex"),
    title: z.string().min(1).max(2_000),
    authors: z.array(z.string().min(1).max(500)).max(500).readonly(),
    year: z.number().int().min(1000).max(9999).nullable(),
    citationCount: z.number().int().nonnegative().nullable(),
    doi: z.string().min(1).max(300).nullable(),
    sourceUrl: z.string().url().nullable(),
    abstract: z.string().max(1_000_000).nullable(),
  })
  .readonly()

export const scholarlyGraphEdgeSchema = z
  .object({
    sourceId: z.string().url(),
    targetId: z.string().url(),
    direction: scholarlyGraphDirectionSchema,
    provenance: z.literal("openalex"),
  })
  .readonly()

const graphDirectionStateSchema = z
  .object({
    direction: scholarlyGraphDirectionSchema,
    status: z.enum(["success", "error"]),
    resultCount: z.number().int().nonnegative().max(60),
    totalResults: z.number().int().nonnegative().nullable(),
    truncated: z.boolean(),
    error: z
      .object({
        kind: z.enum([
          "timeout",
          "cancelled",
          "network",
          "oversized",
          "rate_limited",
          "http_error",
          "malformed_response",
        ]),
        httpStatus: z.number().int().min(100).max(599).nullable(),
      })
      .readonly()
      .nullable(),
  })
  .readonly()

export const scholarlyGraphResultSchema = z
  .object({
    status: z.enum(["complete", "partial", "failed", "cancelled"]),
    provider: z.literal("openalex"),
    seedIds: z.array(z.string().url()).min(1).max(1).readonly(),
    nodes: z.array(scholarlyGraphArticleSchema).max(61).readonly(),
    edges: z.array(scholarlyGraphEdgeSchema).max(180).readonly(),
    directions: z.array(graphDirectionStateSchema).min(1).max(3).readonly(),
    truncated: z.boolean(),
  })
  .readonly()

export type ScholarlyGraphDirection = z.infer<typeof scholarlyGraphDirectionSchema>
export type ScholarlyGraphRequest = z.input<typeof scholarlyGraphRequestSchema>
export type ParsedScholarlyGraphRequest = z.output<typeof scholarlyGraphRequestSchema>
export type ScholarlyGraphArticle = z.infer<typeof scholarlyGraphArticleSchema>
export type ScholarlyGraphEdge = z.infer<typeof scholarlyGraphEdgeSchema>
export type ScholarlyGraphResult = z.infer<typeof scholarlyGraphResultSchema>
