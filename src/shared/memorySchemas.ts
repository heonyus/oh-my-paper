import { z } from "zod"

export const memoryIdSchema = z.string().uuid().brand("MemoryId")
export const memoryDerivationKeySchema = z.string().min(1).max(512).brand("MemoryDerivationKey")
export const memoryStateSchema = z.enum(["pending", "accepted", "rejected", "invalidated"])
export const memoryScopeKindSchema = z.enum([
  "collection",
  "project",
  "document",
  "note",
  "session",
])
export const memoryOriginKindSchema = z.enum(["user", "navigation", "local_inference"])
export const memoryLocalSourceKeySchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/^(?:https?:\/\/|wiki:)/iu.test(value), {
    message: "Memory sources must be local oh-my-paper records",
  })
export const memoryEvidenceKindSchema = z.enum([
  "note",
  "pdf-fragment",
  "knowledge-record",
  "navigation",
])
export const memoryNavigationKindSchema = z.enum([
  "opened_document",
  "opened_page",
  "returned_to_source",
  "selected_fragment",
])

export const memoryScopeSchema = z.object({
  kind: memoryScopeKindSchema,
  key: z.string().min(1).max(256),
})

export const memoryOriginSchema = z.object({
  kind: memoryOriginKindSchema,
  modelVersion: z.string().max(128).nullable(),
})

export const memoryEvidenceSchema = z.object({
  kind: memoryEvidenceKindSchema,
  sourceKey: memoryLocalSourceKeySchema,
  sourceRevision: z.string().min(1).max(256),
  quote: z.string().max(4_000).nullable(),
  page: z.number().int().positive().nullable(),
})

export const memoryDraftSchema = z.object({
  derivationKey: memoryDerivationKeySchema,
  text: z.string().min(1).max(12_000),
  conservativeTokenEstimate: z.number().int().positive().max(20_000).optional(),
  scope: memoryScopeSchema,
  evidence: z.array(memoryEvidenceSchema).max(16),
  revision: z.number().int().positive(),
  origin: memoryOriginSchema,
})

export const memoryRecordSchema = z.object({
  id: memoryIdSchema,
  derivationKey: memoryDerivationKeySchema,
  text: z.string().min(1).max(12_000),
  conservativeTokenEstimate: z.number().int().positive().max(20_000),
  scope: memoryScopeSchema,
  evidence: z.array(memoryEvidenceSchema).max(16),
  revision: z.number().int().positive(),
  origin: memoryOriginSchema,
  state: memoryStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  invalidatedAt: z.string().datetime().nullable(),
})

export const memoryListQuerySchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(20).default(20),
  state: memoryStateSchema.nullable().default(null),
})

export const memoryRetrievalQuerySchema = z.object({
  scope: memoryScopeSchema,
  terms: z.array(z.string().min(1).max(128)).max(16).default([]),
})

export const memoryNavigationRecentSchema = z.object({
  id: z.number().int().positive(),
  scope: memoryScopeSchema,
  kind: memoryNavigationKindSchema,
  fact: z.string().min(1).max(1_000),
  sourceKey: memoryLocalSourceKeySchema,
  sourceRevision: z.string().min(1).max(256),
  occurredAt: z.string().datetime(),
})

export const memoryNavigationInputSchema = z.object({
  scope: memoryScopeSchema,
  kind: memoryNavigationKindSchema,
  fact: z.string().min(1).max(1_000),
  sourceKey: memoryLocalSourceKeySchema,
  sourceRevision: z.string().min(1).max(256),
  occurredAt: z.string().datetime(),
})

export type MemoryId = z.infer<typeof memoryIdSchema>
export type MemoryDerivationKey = z.infer<typeof memoryDerivationKeySchema>
export type MemoryState = z.infer<typeof memoryStateSchema>
export type MemoryScope = Readonly<z.infer<typeof memoryScopeSchema>>
export type MemoryOrigin = Readonly<z.infer<typeof memoryOriginSchema>>
export type MemoryEvidence = Readonly<z.infer<typeof memoryEvidenceSchema>>
export type MemoryDraft = Readonly<
  Omit<z.infer<typeof memoryDraftSchema>, "scope" | "origin" | "evidence">
> & {
  readonly scope: MemoryScope
  readonly origin: MemoryOrigin
  readonly evidence: readonly MemoryEvidence[]
}
export type MemoryRecord = Readonly<
  Omit<z.infer<typeof memoryRecordSchema>, "scope" | "origin" | "evidence">
> & {
  readonly scope: MemoryScope
  readonly origin: MemoryOrigin
  readonly evidence: readonly MemoryEvidence[]
}
export type MemoryListQuery = Readonly<z.infer<typeof memoryListQuerySchema>>
export type MemoryRetrievalQuery = Readonly<
  Omit<z.infer<typeof memoryRetrievalQuerySchema>, "scope" | "terms">
> & {
  readonly scope: MemoryScope
  readonly terms: readonly string[]
}
export type MemoryNavigationRecent = Readonly<z.infer<typeof memoryNavigationRecentSchema>>
export type MemoryNavigationInput = Readonly<z.infer<typeof memoryNavigationInputSchema>>

export const MEMORY_RETRIEVAL_LIMITS: Readonly<{
  readonly maxEntries: 8
  readonly maxConservativeTokens: 1_000
  readonly candidateLimit: 64
}> = {
  maxEntries: 8,
  maxConservativeTokens: 1_000,
  candidateLimit: 64,
}

export type MemoryPage = Readonly<{
  readonly page: number
  readonly pageSize: number
  readonly records: readonly MemoryRecord[]
  readonly hasNextPage: boolean
}>

export type MemoryRetrievalResult = Readonly<{
  readonly records: readonly MemoryRecord[]
  readonly conservativeTokenCount: number
  readonly omittedCount: number
}>

export type MemoryCreateResult =
  | Readonly<{ readonly kind: "created"; readonly record: MemoryRecord }>
  | Readonly<{
      readonly kind: "suppressed"
      readonly derivationKey: MemoryDerivationKey
      readonly scope: MemoryScope
      readonly forgottenAt: string
    }>

export function memoryStateLabel(state: MemoryState): string {
  switch (state) {
    case "pending":
      return "검토 대기"
    case "accepted":
      return "승인됨"
    case "rejected":
      return "거부됨"
    case "invalidated":
      return "출처 변경으로 무효화"
    default:
      return assertNever(state)
  }
}

export function memoryOriginLabel(origin: MemoryOrigin): string {
  switch (origin.kind) {
    case "user":
      return "사용자 확인"
    case "navigation":
      return "사실 탐색 기록"
    case "local_inference":
      return origin.modelVersion ? `로컬 추론 · ${origin.modelVersion}` : "로컬 추론"
    default:
      return assertNever(origin.kind)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected memory variant: ${String(value)}`)
}
