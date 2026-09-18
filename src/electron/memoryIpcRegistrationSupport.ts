import { z } from "zod"
import { memoryIpcErrorSchema, memoryIpcResponseSchema } from "../shared/memoryIpc"
import type { MemoryId, MemoryListQuery, MemoryRecord, MemoryScope } from "../shared/memorySchemas"
import { MemorySourceValidationError } from "./memoryIpcSourceValidation"
import {
  type MemoryCandidatePage,
  MemoryNotFoundError,
  type MemoryRepository,
  MemoryTransitionError,
} from "./memoryRepository"

export type ScopedPageRequest = Readonly<{
  readonly scope: MemoryScope
  readonly page: number
  readonly pageSize: number
  readonly state?: MemoryListQuery["state"]
}>

export class MemoryScopeError extends Error {
  readonly name = "MemoryScopeError"
}

export function createMemoryIpcHandler<TRequest, TOutput>(
  requestSchema: z.ZodType<TRequest>,
  outputSchema: z.ZodType<TOutput>,
  action: (request: TRequest) => TOutput | Promise<TOutput>,
): (event: unknown, payload: unknown) => Promise<unknown> {
  return async (_event, payload) => {
    try {
      const request = requestSchema.parse(payload)
      const value = await action(request)
      return memoryIpcResponseSchema(outputSchema).parse({ ok: true, value })
    } catch (error) {
      return {
        ok: false,
        error: memoryIpcErrorSchema.parse(toIpcError(error)),
      }
    }
  }
}

export function listScoped(
  repository: MemoryRepository,
  request: ScopedPageRequest,
  candidatePage?: MemoryCandidatePage,
): Readonly<{
  readonly page: number
  readonly pageSize: number
  readonly records: readonly MemoryRecord[]
  readonly hasNextPage: boolean
}> {
  if (!candidatePage) return repository.list(request, request.scope)
  const state = request.state ?? null
  const records = candidatePage.candidates.filter(
    (record) => state === null || record.state === state,
  )
  return {
    page: candidatePage.page,
    pageSize: candidatePage.pageSize,
    records: records.slice(0, candidatePage.pageSize),
    hasNextPage: candidatePage.hasNextPage,
  }
}

export function requireScopedRecord(
  repository: MemoryRepository,
  id: MemoryId,
  scope: MemoryScope,
): MemoryRecord {
  const record = repository.get(id)
  if (!record) throw new MemoryNotFoundError(id)
  if (!sameScope(record.scope, scope))
    throw new MemoryScopeError("Memory is outside this collection")
  return record
}

export function ensureScope(actual: MemoryScope, expected: MemoryScope): void {
  if (!sameScope(actual, expected))
    throw new MemoryScopeError("Memory scope does not match this collection")
}

export function sameScope(left: MemoryScope, right: MemoryScope): boolean {
  return left.kind === right.kind && left.key === right.key
}

function toIpcError(error: unknown): Readonly<{ readonly code: string; readonly message: string }> {
  if (error instanceof z.ZodError)
    return { code: "invalid_request", message: "Invalid memory request" }
  if (error instanceof MemoryNotFoundError) return { code: "not_found", message: error.message }
  if (error instanceof MemoryTransitionError)
    return { code: "invalid_state", message: error.message }
  if (error instanceof MemorySourceValidationError)
    return { code: "stale_source", message: error.message }
  if (error instanceof MemoryScopeError) return { code: "invalid_request", message: error.message }
  return { code: "internal", message: "Memory operation failed" }
}
