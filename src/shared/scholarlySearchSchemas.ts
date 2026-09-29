import { z } from "zod"

export const scholarlyProviderSchema = z.enum(["crossref", "arxiv", "openalex"])
export const scholarlyProviders = scholarlyProviderSchema.options

const searchFiltersSchema = z
  .object({
    fromYear: z.number().int().min(1000).max(9999).optional(),
    toYear: z.number().int().min(1000).max(9999).optional(),
  })
  .refine(
    ({ fromYear, toYear }) => fromYear === undefined || toYear === undefined || fromYear <= toYear,
    "fromYear must not exceed toYear",
  )
  .readonly()

export const scholarlySearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    providers: z
      .array(scholarlyProviderSchema)
      .min(1)
      .max(3)
      .refine(
        (providers) => new Set(providers).size === providers.length,
        "providers must be unique",
      )
      .readonly()
      .default(scholarlyProviders),
    filters: searchFiltersSchema.default({}),
    page: z.number().int().min(1).max(100).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .readonly()

export const scholarlyIdentitySchema = z
  .object({
    providerRecordId: z.string().min(1).max(500),
    doi: z.string().min(1).max(300).nullable(),
    arxivId: z.string().min(1).max(80).nullable(),
    openAlexId: z.string().min(1).max(80).nullable(),
  })
  .readonly()

const fullTextAccessSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unavailable"), url: z.null() }).readonly(),
  z
    .object({
      state: z.enum(["open", "link_only"]),
      url: z.string().url(),
    })
    .readonly(),
])

export const scholarlyAccessSchema = z
  .object({
    metadata: z.literal("available"),
    abstract: z.enum(["available", "unavailable"]),
    fullText: fullTextAccessSchema,
  })
  .readonly()

export const scholarlySearchItemSchema = z
  .object({
    provider: scholarlyProviderSchema,
    identity: scholarlyIdentitySchema,
    title: z.string().min(1).max(2_000),
    authors: z.array(z.string().min(1).max(500)).max(500).readonly(),
    year: z.number().int().min(1000).max(9999).nullable(),
    venue: z.string().max(1_000),
    abstract: z.string().max(1_000_000).nullable(),
    landingUrl: z.string().url().nullable(),
    citationCount: z.number().int().nonnegative().nullable(),
    access: scholarlyAccessSchema,
  })
  .readonly()

export const scholarlyProviderErrorKindSchema = z.enum([
  "rate_limited",
  "timeout",
  "oversized",
  "cancelled",
  "network",
  "http_error",
  "malformed_response",
])

const providerErrorSchema = z
  .object({
    kind: scholarlyProviderErrorKindSchema,
    httpStatus: z.number().int().min(100).max(599).nullable(),
    retryAfterSeconds: z.number().int().nonnegative().nullable(),
  })
  .readonly()

export const scholarlyProviderStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      provider: scholarlyProviderSchema,
      status: z.literal("success"),
      freshness: z.enum(["live", "cached"]),
      resultCount: z.number().int().nonnegative().max(100),
      totalResults: z.number().int().nonnegative().nullable(),
      hasMore: z.boolean(),
    })
    .readonly(),
  z
    .object({
      provider: scholarlyProviderSchema,
      status: z.literal("error"),
      error: providerErrorSchema,
    })
    .readonly(),
])

export const scholarlySearchResultSchema = z
  .object({
    status: z.enum(["complete", "partial", "failed", "cancelled"]),
    query: z.string().min(1).max(500),
    page: z.number().int().min(1).max(100),
    pageSize: z.number().int().min(1).max(100),
    results: z.array(scholarlySearchItemSchema).max(100).readonly(),
    providers: z.array(scholarlyProviderStateSchema).min(1).max(3).readonly(),
  })
  .readonly()

export type ScholarlyProvider = z.infer<typeof scholarlyProviderSchema>
export type ScholarlySearchRequest = z.input<typeof scholarlySearchRequestSchema>
export type ParsedScholarlySearchRequest = z.output<typeof scholarlySearchRequestSchema>
export type ScholarlySearchItem = z.infer<typeof scholarlySearchItemSchema>
export type ScholarlyProviderErrorKind = z.infer<typeof scholarlyProviderErrorKindSchema>
export type ScholarlyProviderState = z.infer<typeof scholarlyProviderStateSchema>
export type ScholarlySearchResult = z.infer<typeof scholarlySearchResultSchema>

/**
 * Progress of one related-paper search. The server reports provider and merge steps; the
 * reader adds its own ranking and Jev judging steps so the panel shows the whole pipeline.
 */
export const scholarlySearchStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["provider", "merge", "rank", "judge"]),
    provider: scholarlyProviderSchema.optional(),
    status: z.enum(["running", "done", "failed"]),
    found: z.number().int().nonnegative().optional(),
    detail: z.string().max(500).optional(),
  })
  .readonly()

export const scholarlySearchStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), step: scholarlySearchStepSchema }).readonly(),
  z.object({ type: z.literal("result"), result: scholarlySearchResultSchema }).readonly(),
  z.object({ type: z.literal("error"), error: z.string().max(500) }).readonly(),
])

export type ScholarlySearchStep = z.infer<typeof scholarlySearchStepSchema>
export type ScholarlySearchStreamEvent = z.infer<typeof scholarlySearchStreamEventSchema>
