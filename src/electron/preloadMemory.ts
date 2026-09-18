import { z } from "zod"
import {
  type MemoryIpcErrorCode,
  type MemoryPreloadApi,
  memoryActionRequestSchema,
  memoryCreateResultSchema,
  memoryExportRequestSchema,
  memoryExportSchema,
  memoryInvalidateRequestSchema,
  memoryIpcChannels,
  memoryIpcResponseSchema,
  memoryListRequestSchema,
  memoryPageSchema,
  memoryProposeRequestSchema,
  memoryRecentsRequestSchema,
  memoryRetrievalResultSchema,
  memoryRetrieveRequestSchema,
  memoryScopeRequestSchema,
  memoryScopeSchema,
} from "../shared/memoryIpc"
import {
  type MemoryId,
  type MemoryPage,
  type MemoryScope,
  memoryNavigationRecentSchema,
} from "../shared/memorySchemas"

export interface MemoryIpcRenderer {
  readonly invoke: (channel: string, payload: unknown) => Promise<unknown>
}

export class MemoryIpcError extends Error {
  readonly name = "MemoryIpcError"

  constructor(
    readonly code: MemoryIpcErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export function createMemoryPreloadApi(
  renderer: MemoryIpcRenderer,
  collectionScope?: MemoryScope,
): MemoryPreloadApi {
  const suppliedScope = collectionScope ? memoryScopeSchema.parse(collectionScope) : null
  const resolveScope = (): Promise<MemoryScope> =>
    suppliedScope
      ? Promise.resolve(suppliedScope)
      : invoke(renderer, memoryIpcChannels.scope, memoryScopeRequestSchema, memoryScopeSchema, {})
  return {
    getScope: resolveScope,
    list: async (input = {}) =>
      invoke(
        renderer,
        memoryIpcChannels.list,
        memoryListRequestSchema,
        memoryPageSchema,
        withScope(await resolveScope(), input),
      ),
    navigationRecents: async () =>
      invoke(
        renderer,
        memoryIpcChannels.recents,
        memoryRecentsRequestSchema,
        memoryNavigationRecentSchema.array(),
        { scope: await resolveScope() },
      ),
    retrieve: async (input = {}) =>
      invoke(
        renderer,
        memoryIpcChannels.retrieve,
        memoryRetrieveRequestSchema,
        memoryRetrievalResultSchema,
        withScope(await resolveScope(), input),
      ),
    propose: async (input) =>
      invoke(
        renderer,
        memoryIpcChannels.propose,
        memoryProposeRequestSchema,
        memoryCreateResultSchema,
        withScope(await resolveScope(), input),
      ),
    approve: (id) => action(renderer, memoryIpcChannels.approve, resolveScope, id),
    reject: (id) => action(renderer, memoryIpcChannels.reject, resolveScope, id),
    forget: (id) => action(renderer, memoryIpcChannels.forget, resolveScope, id),
    invalidate: async (input) =>
      invoke(
        renderer,
        memoryIpcChannels.invalidate,
        memoryInvalidateRequestSchema,
        z.number().int().nonnegative(),
        withScope(await resolveScope(), input),
      ),
    export: async (input = {}) =>
      invoke(
        renderer,
        memoryIpcChannels.export,
        memoryExportRequestSchema,
        memoryExportSchema,
        withScope(await resolveScope(), input),
      ),
  }
}

async function action(
  renderer: MemoryIpcRenderer,
  channel: string,
  resolveScope: () => Promise<MemoryScope>,
  id: MemoryId,
): Promise<MemoryPage["records"][number]> {
  return invoke(
    renderer,
    channel,
    memoryActionRequestSchema,
    memoryPageSchema.shape.records.element,
    { scope: await resolveScope(), id },
  )
}

async function invoke<TRequest, TOutput>(
  renderer: MemoryIpcRenderer,
  channel: string,
  requestSchema: z.ZodType<TRequest>,
  outputSchema: z.ZodType<TOutput>,
  rawRequest: unknown,
): Promise<TOutput> {
  const request = requestSchema.parse(rawRequest)
  const response = memoryIpcResponseSchema(outputSchema).parse(
    await renderer.invoke(channel, request),
  )
  if (!response.ok) throw new MemoryIpcError(response.error.code, response.error.message)
  return response.value
}

function withScope<T extends object>(
  scope: MemoryScope,
  input: T,
): T & { readonly scope: MemoryScope } {
  return { ...input, scope }
}
