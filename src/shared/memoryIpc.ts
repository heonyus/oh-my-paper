import { z } from "zod"
import { collectionRevisionSchema } from "./collectionSchemas"
import {
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
  knowledgeNodeIdSchema,
} from "./knowledgeSchemas"
import {
  type MemoryCreateResult,
  type MemoryId,
  type MemoryNavigationRecent,
  type MemoryPage,
  type MemoryRecord,
  type MemoryRetrievalResult,
  type MemoryScope,
  memoryDerivationKeySchema,
  memoryIdSchema,
  memoryLocalSourceKeySchema,
  memoryNavigationRecentSchema,
  memoryRecordSchema,
  memoryScopeSchema,
  memoryStateSchema,
} from "./memorySchemas"
import { sha256Schema } from "./schemas"

export { memoryScopeSchema } from "./memorySchemas"

export type MemoryIpcOperation =
  | "list"
  | "scope"
  | "recents"
  | "retrieve"
  | "propose"
  | "approve"
  | "reject"
  | "forget"
  | "invalidate"
  | "export"

export const memoryIpcChannels: Readonly<Record<MemoryIpcOperation, string>> = {
  list: "memory:list",
  scope: "memory:scope",
  recents: "memory:recents",
  retrieve: "memory:retrieve",
  propose: "memory:propose",
  approve: "memory:approve",
  reject: "memory:reject",
  forget: "memory:forget",
  invalidate: "memory:invalidate",
  export: "memory:export",
}

export const memoryIpcErrorCodeSchema = z.enum([
  "invalid_request",
  "not_found",
  "invalid_state",
  "stale_source",
  "internal",
])

export const memoryIpcErrorSchema = z.object({
  code: memoryIpcErrorCodeSchema,
  message: z.string().min(1).max(1_000),
})

export const memoryPageSchema = z.object({
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive().max(20),
  records: z.array(memoryRecordSchema).max(20),
  hasNextPage: z.boolean(),
})

export const memoryRetrievalResultSchema = z.object({
  records: z.array(memoryRecordSchema).max(8),
  conservativeTokenCount: z.number().int().nonnegative().max(1_000),
  omittedCount: z.number().int().nonnegative(),
})

export const memoryCreateResultSchema = z.union([
  z.object({
    kind: z.literal("created"),
    record: memoryRecordSchema,
  }),
  z.object({
    kind: z.literal("suppressed"),
    derivationKey: memoryDerivationKeySchema,
    scope: memoryScopeSchema,
    forgottenAt: z.string().datetime(),
  }),
])

export const memorySourceEvidenceRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("node"),
    nodeId: knowledgeNodeIdSchema,
    sourceRevision: collectionRevisionSchema,
  }),
  z.object({
    kind: z.literal("pdf-fragment"),
    evidenceAnchorId: evidenceAnchorIdSchema,
    documentVersionId: documentVersionIdSchema,
    sourceRevision: sha256Schema,
  }),
])

export const memoryScopeRequestSchema = z.object({}).strict()

export const memoryListRequestSchema = z.object({
  scope: memoryScopeSchema,
  page: z.number().int().nonnegative().max(10_000).default(0),
  pageSize: z.number().int().positive().max(20).default(20),
  state: memoryStateSchema.nullable().default(null),
})

export const memoryRecentsRequestSchema = z.object({
  scope: memoryScopeSchema,
})

export const memoryRetrieveRequestSchema = z.object({
  scope: memoryScopeSchema,
  terms: z.array(z.string().min(1).max(128)).max(16).default([]),
})

export const memoryProposeRequestSchema = z.object({
  scope: memoryScopeSchema,
  derivationKey: memoryDerivationKeySchema,
  text: z.string().min(1).max(12_000),
  revision: z.number().int().positive(),
  sourceEvidence: z.array(memorySourceEvidenceRequestSchema).max(16).default([]),
})

export const memoryActionRequestSchema = z.object({
  scope: memoryScopeSchema,
  id: memoryIdSchema,
})

export const memoryInvalidateRequestSchema = z.object({
  scope: memoryScopeSchema,
  sourceKey: memoryLocalSourceKeySchema,
  currentRevision: z.string().min(1).max(256),
})

export const memoryExportRequestSchema = z.object({
  scope: memoryScopeSchema,
  page: z.number().int().nonnegative().max(10_000).default(0),
  pageSize: z.number().int().positive().max(20).default(20),
  includeNavigationRecents: z.boolean().default(false),
})

export const memoryExportSchema = z.object({
  page: memoryPageSchema,
  navigationRecents: z.array(memoryNavigationRecentSchema).max(100),
})

export function memoryIpcResponseSchema<TSchema extends z.ZodType>(valueSchema: TSchema) {
  return z.union([
    z.object({ ok: z.literal(true), value: valueSchema }),
    z.object({ ok: z.literal(false), error: memoryIpcErrorSchema }),
  ])
}

export type MemoryIpcErrorCode = z.infer<typeof memoryIpcErrorCodeSchema>
export type MemoryPageResponse = MemoryPage
export type MemoryRetrievalResponse = MemoryRetrievalResult
export type MemoryCreateResponse = MemoryCreateResult
export type MemoryRecordResponse = MemoryRecord
export type MemoryRecentResponse = MemoryNavigationRecent
export type MemoryExportResponse = Readonly<{
  readonly page: MemoryPage
  readonly navigationRecents: readonly MemoryNavigationRecent[]
}>
export type MemoryListInput = Readonly<Omit<z.input<typeof memoryListRequestSchema>, "scope">>
export type MemoryRetrieveInput = Readonly<
  Omit<z.input<typeof memoryRetrieveRequestSchema>, "scope">
>
export type MemoryProposeInput = Readonly<
  Omit<z.input<typeof memoryProposeRequestSchema>, "scope" | "derivationKey"> & {
    readonly derivationKey: string
  }
>
export type MemoryInvalidateInput = Readonly<
  Omit<z.input<typeof memoryInvalidateRequestSchema>, "scope">
>
export type MemoryExportInput = Readonly<Omit<z.input<typeof memoryExportRequestSchema>, "scope">>
export interface MemoryPreloadApi {
  readonly getScope: () => Promise<MemoryScope>
  readonly list: (input?: MemoryListInput) => Promise<MemoryPage>
  readonly navigationRecents: () => Promise<readonly MemoryNavigationRecent[]>
  readonly retrieve: (input?: MemoryRetrieveInput) => Promise<MemoryRetrievalResult>
  readonly propose: (input: MemoryProposeInput) => Promise<MemoryCreateResult>
  readonly approve: (id: MemoryId) => Promise<MemoryPage["records"][number]>
  readonly reject: (id: MemoryId) => Promise<MemoryPage["records"][number]>
  readonly forget: (id: MemoryId) => Promise<MemoryPage["records"][number]>
  readonly invalidate: (input: MemoryInvalidateInput) => Promise<number>
  readonly export: (input?: MemoryExportInput) => Promise<MemoryExportResponse>
}
export type MemoryScopeInput = MemoryScope
export type MemoryActionId = MemoryId
export type MemoryListRequest = Readonly<z.input<typeof memoryListRequestSchema>>
export type MemoryRecentsRequest = Readonly<z.input<typeof memoryRecentsRequestSchema>>
export type MemoryRetrieveRequest = Readonly<z.input<typeof memoryRetrieveRequestSchema>>
export type MemoryProposeRequest = Readonly<z.input<typeof memoryProposeRequestSchema>>
export type MemoryActionRequest = Readonly<z.input<typeof memoryActionRequestSchema>>
export type MemoryInvalidateRequest = Readonly<z.input<typeof memoryInvalidateRequestSchema>>
export type MemoryExportRequest = Readonly<z.input<typeof memoryExportRequestSchema>>
export type MemorySourceEvidenceRequest = Readonly<
  z.infer<typeof memorySourceEvidenceRequestSchema>
>
