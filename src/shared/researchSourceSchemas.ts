import { z } from "zod"

export const researchSourceIdSchema = z.string().uuid().brand("ResearchSourceId")
export const researchRequestIdSchema = z.string().uuid().brand("ResearchRequestId")

export const webSearchCapabilitySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("verified"),
      runtime: z.literal("codex_app_server"),
      billing: z.literal("chatgpt_subscription"),
      mode: z.literal("live"),
      protocol: z.literal("runtime_verified"),
      runtimeVerified: z.literal(true),
      structuredSourceEvents: z.literal(true),
    })
    .readonly(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum([
        "runtime_missing",
        "authentication_required",
        "billing_unverified",
        "quota_reached",
        "protocol_unavailable",
        "search_disabled",
        "structured_sources_unsupported",
      ]),
      detail: z.string().max(500).nullable(),
    })
    .readonly(),
])

export const webDiscoveryRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(1_000),
    maxResults: z.number().int().min(1).max(20).default(20),
  })
  .readonly()

export const webDiscoveryResultSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    title: z.string().trim().min(1).max(2_000),
    url: z.string().url(),
    snippet: z.string().max(8_000).nullable(),
    kind: z.enum(["landing_page", "pdf"]),
  })
  .readonly()

export const webDiscoveryResponseSchema = z
  .object({
    requestId: researchRequestIdSchema,
    providerRequestId: z.string().min(1).max(500),
    capability: webSearchCapabilitySchema,
    results: z.array(webDiscoveryResultSchema).max(20).readonly(),
  })
  .readonly()

const sourceCommonSchema = z.object({
  id: researchSourceIdSchema,
  title: z.string().trim().min(1).max(2_000),
  url: z.string().url(),
  finalUrl: z.string().url(),
  page: z.number().int().positive().nullable(),
  snippet: z.string().max(16_000).nullable(),
})

export const researchSourceSchema = z.discriminatedUnion("access", [
  sourceCommonSchema
    .extend({
      access: z.literal("metadata_only"),
      origin: z.enum(["web", "local"]),
      contentType: z.null(),
      byteLength: z.literal(0),
      contentHash: z.null(),
      content: z.null(),
      fetchedAt: z.null(),
    })
    .readonly(),
  sourceCommonSchema
    .extend({
      access: z.literal("html_excerpt"),
      origin: z.literal("web"),
      contentType: z.enum(["text/html", "application/xhtml+xml", "text/plain"]),
      byteLength: z
        .number()
        .int()
        .positive()
        .max(5 * 1024 * 1024),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      content: z.string().min(1).max(500_000),
      fetchedAt: z.string().datetime(),
    })
    .readonly(),
  sourceCommonSchema
    .extend({
      access: z.literal("pdf_binary"),
      origin: z.literal("web"),
      contentType: z.literal("application/pdf"),
      byteLength: z
        .number()
        .int()
        .positive()
        .max(100 * 1024 * 1024),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      content: z.null(),
      fetchedAt: z.string().datetime(),
    })
    .readonly(),
  sourceCommonSchema
    .extend({
      access: z.literal("local_excerpt"),
      origin: z.literal("local"),
      contentType: z.literal("text/markdown"),
      byteLength: z.number().int().nonnegative(),
      contentHash: z.string().min(1).max(256),
      content: z.string().min(1).max(500_000),
      fetchedAt: z.string().datetime(),
    })
    .readonly(),
])

export type ResearchSourceId = z.infer<typeof researchSourceIdSchema>
export type ResearchRequestId = z.infer<typeof researchRequestIdSchema>
export type WebSearchCapability = z.infer<typeof webSearchCapabilitySchema>
export type WebDiscoveryRequest = z.input<typeof webDiscoveryRequestSchema>
export type ParsedWebDiscoveryRequest = z.output<typeof webDiscoveryRequestSchema>
export type WebDiscoveryResult = z.infer<typeof webDiscoveryResultSchema>
export type WebDiscoveryResponse = z.infer<typeof webDiscoveryResponseSchema>
export type ResearchSource = z.infer<typeof researchSourceSchema>
