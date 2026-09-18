import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { KnowledgeNodeId } from "../shared/knowledgeSchemas"
import { knowledgeNodeIdSchema } from "../shared/knowledgeSchemas"
import {
  memoryActionRequestSchema,
  memoryCreateResultSchema,
  memoryExportRequestSchema,
  memoryExportSchema,
  memoryInvalidateRequestSchema,
  memoryIpcChannels,
  memoryListRequestSchema,
  memoryPageSchema,
  memoryProposeRequestSchema,
  memoryRecentsRequestSchema,
  memoryRetrievalResultSchema,
  memoryRetrieveRequestSchema,
  memoryScopeRequestSchema,
} from "../shared/memoryIpc"
import {
  MEMORY_RETRIEVAL_LIMITS,
  type MemoryScope,
  memoryNavigationRecentSchema,
  memoryRecordSchema,
  memoryScopeSchema,
} from "../shared/memorySchemas"
import type { CollectionChangeEvent } from "./collectionServiceTypes"
import { refreshMemorySourceValidity } from "./memoryIpcFreshness"
import {
  createMemoryIpcHandler,
  ensureScope,
  listScoped,
  MemoryScopeError,
  requireScopedRecord,
} from "./memoryIpcRegistrationSupport"
import {
  buildMemoryEvidence,
  type MemorySourceRevisionReader,
  validateMemoryRecordEvidence,
} from "./memoryIpcSourceValidation"
import { initializeMemoryRepository, MemoryRepository } from "./memoryRepository"

export interface MemoryIpcMain {
  handle(channel: string, listener: (event: unknown, payload: unknown) => Promise<unknown>): void
  readonly removeHandler?: (channel: string) => void
}

export interface MemoryIpcRegistrationOptions {
  readonly collectionScope: MemoryScope
  readonly sourceRevisionReader?: MemorySourceRevisionReader
}

export type MemoryRepositoryTarget = DatabaseSync | MemoryRepository

export function createMemoryCollectionChangeInvalidator(
  target: MemoryRepositoryTarget,
  readCurrentRevision: (nodeId: KnowledgeNodeId) => string | null,
): (event: CollectionChangeEvent) => void {
  const repository =
    target instanceof MemoryRepository ? target : initializeMemoryRepository(target)
  return (event) => {
    for (const rawId of [...event.changedNoteIds, ...event.removedNoteIds]) {
      const nodeId = knowledgeNodeIdSchema.safeParse(rawId)
      if (!nodeId.success) continue
      const revision = readCurrentRevision(nodeId.data) ?? `missing:${event.scannedAt}`
      repository.invalidateSource(`node:${nodeId.data}`, revision)
    }
  }
}

export function registerMemoryIpc(
  host: MemoryIpcMain,
  target: MemoryRepositoryTarget,
  options: MemoryIpcRegistrationOptions,
): () => void {
  const repository =
    target instanceof MemoryRepository ? target : initializeMemoryRepository(target)
  const scope = memoryScopeSchema.parse(options.collectionScope)
  const sourceReader = options.sourceRevisionReader

  host.handle(
    memoryIpcChannels.scope,
    createMemoryIpcHandler(memoryScopeRequestSchema, memoryScopeSchema, () => scope),
  )

  host.handle(
    memoryIpcChannels.list,
    createMemoryIpcHandler(memoryListRequestSchema, memoryPageSchema, (request) => {
      ensureScope(request.scope, scope)
      const candidatePage = repository.listPageCandidates(request, scope)
      const refreshedCandidates = refreshMemorySourceValidity(
        repository,
        scope,
        sourceReader,
        candidatePage.candidates,
      )
      return listScoped(repository, request, {
        ...candidatePage,
        candidates: refreshedCandidates,
      })
    }),
  )
  host.handle(
    memoryIpcChannels.recents,
    createMemoryIpcHandler(
      memoryRecentsRequestSchema,
      memoryNavigationRecentSchema.array(),
      (request) => {
        ensureScope(request.scope, scope)
        return repository.listNavigationRecents(scope)
      },
    ),
  )
  host.handle(
    memoryIpcChannels.retrieve,
    createMemoryIpcHandler(memoryRetrieveRequestSchema, memoryRetrievalResultSchema, (request) => {
      ensureScope(request.scope, scope)
      const candidates = repository.listAcceptedForScope(
        scope,
        MEMORY_RETRIEVAL_LIMITS.candidateLimit,
      )
      const refreshedCandidates = refreshMemorySourceValidity(
        repository,
        scope,
        sourceReader,
        candidates,
      )
      return repository.retrieve(request, refreshedCandidates)
    }),
  )
  host.handle(
    memoryIpcChannels.propose,
    createMemoryIpcHandler(memoryProposeRequestSchema, memoryCreateResultSchema, (request) => {
      ensureScope(request.scope, scope)
      return repository.propose({
        derivationKey: request.derivationKey,
        text: request.text,
        scope,
        evidence: buildMemoryEvidence(sourceReader, request.sourceEvidence),
        revision: request.revision,
        origin: { kind: "user", modelVersion: null },
      })
    }),
  )
  host.handle(
    memoryIpcChannels.approve,
    createMemoryIpcHandler(memoryActionRequestSchema, memoryRecordSchema, (request) => {
      ensureScope(request.scope, scope)
      const record = requireScopedRecord(repository, request.id, scope)
      validateMemoryRecordEvidence(sourceReader, record)
      return repository.approve(record.id)
    }),
  )
  host.handle(
    memoryIpcChannels.reject,
    createMemoryIpcHandler(memoryActionRequestSchema, memoryRecordSchema, (request) => {
      ensureScope(request.scope, scope)
      const record = requireScopedRecord(repository, request.id, scope)
      return repository.reject(record.id)
    }),
  )
  host.handle(
    memoryIpcChannels.forget,
    createMemoryIpcHandler(memoryActionRequestSchema, memoryRecordSchema, (request) => {
      ensureScope(request.scope, scope)
      const record = requireScopedRecord(repository, request.id, scope)
      return repository.forget(record.id)
    }),
  )
  host.handle(
    memoryIpcChannels.invalidate,
    createMemoryIpcHandler(
      memoryInvalidateRequestSchema,
      z.number().int().nonnegative(),
      (request) => {
        ensureScope(request.scope, scope)
        if (repository.hasSourceOutsideScope(request.sourceKey, scope)) {
          throw new MemoryScopeError("Source invalidation is not scoped to this collection")
        }
        return repository.invalidateSource(request.sourceKey, request.currentRevision)
      },
    ),
  )
  host.handle(
    memoryIpcChannels.export,
    createMemoryIpcHandler(memoryExportRequestSchema, memoryExportSchema, (request) => {
      ensureScope(request.scope, scope)
      const candidatePage = repository.listPageCandidates(request, scope)
      const refreshedCandidates = refreshMemorySourceValidity(
        repository,
        scope,
        sourceReader,
        candidatePage.candidates,
      )
      return {
        page: listScoped(repository, request, {
          ...candidatePage,
          candidates: refreshedCandidates,
        }),
        navigationRecents: request.includeNavigationRecents
          ? repository.listNavigationRecents(scope)
          : [],
      }
    }),
  )

  return () => {
    Object.values(memoryIpcChannels).forEach((channel) => {
      host.removeHandler?.(channel)
    })
  }
}
