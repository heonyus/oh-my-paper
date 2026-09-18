import type { DatabaseSync } from "node:sqlite"
import {
  MEMORY_RETRIEVAL_LIMITS,
  type MemoryCreateResult,
  type MemoryDraft,
  type MemoryId,
  type MemoryListQuery,
  type MemoryNavigationInput,
  type MemoryNavigationRecent,
  type MemoryPage,
  type MemoryRecord,
  type MemoryRetrievalQuery,
  type MemoryRetrievalResult,
  type MemoryScope,
  memoryDraftSchema,
  memoryIdSchema,
  memoryListQuerySchema,
  memoryRetrievalQuerySchema,
} from "../shared/memorySchemas"
import { listNavigationRecents, recordNavigation } from "./memoryRepositoryNavigation"
import { insertMemory, loadMemory } from "./memoryRepositoryPersistence"
import { tombstoneRowSchema } from "./memoryRepositoryRows"
import { MEMORY_SCHEMA_SQL } from "./memoryRepositorySchema"
import { selectApprovedMemories } from "./memoryRetrieval"

export type MemoryClock = () => string

export type MemoryCandidatePage = Readonly<{
  readonly page: number
  readonly pageSize: number
  readonly candidates: readonly MemoryRecord[]
  readonly hasNextPage: boolean
}>

export function initializeMemoryRepository(
  db: DatabaseSync,
  clock: MemoryClock = () => new Date().toISOString(),
): MemoryRepository {
  db.exec(MEMORY_SCHEMA_SQL)
  return new MemoryRepository(db, clock)
}

export class MemoryRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly clock: MemoryClock,
  ) {}

  propose(rawDraft: MemoryDraft): MemoryCreateResult {
    const draft = memoryDraftSchema.parse(rawDraft)
    const tombstone = this.findTombstone(draft.derivationKey, draft.scope)
    if (tombstone) {
      return {
        kind: "suppressed",
        derivationKey: draft.derivationKey,
        scope: draft.scope,
        forgottenAt: tombstone,
      }
    }
    return {
      kind: "created",
      record: insertMemory({ db: this.db, clock: this.clock }, draft, "pending"),
    }
  }

  createApproved(rawDraft: MemoryDraft): MemoryCreateResult {
    const draft = memoryDraftSchema.parse(rawDraft)
    return {
      kind: "created",
      record: insertMemory({ db: this.db, clock: this.clock }, draft, "accepted"),
    }
  }

  get(id: MemoryId): MemoryRecord | null {
    const parsedId = memoryIdSchema.parse(id)
    const raw = this.db.prepare("SELECT * FROM semantic_memories WHERE id = ?").get(parsedId)
    return raw ? loadMemory(this.db, raw) : null
  }

  approve(id: MemoryId): MemoryRecord {
    return this.transition(id, "accepted", "pending")
  }

  reject(id: MemoryId): MemoryRecord {
    return this.transition(id, "rejected", "pending")
  }

  forget(id: MemoryId): MemoryRecord {
    const current = this.require(id)
    const forgottenAt = this.clock()
    this.db.exec("BEGIN IMMEDIATE")
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO semantic_memory_tombstones
           (derivation_key, scope_kind, scope_key, forgotten_at) VALUES (?, ?, ?, ?)`,
        )
        .run(current.derivationKey, current.scope.kind, current.scope.key, forgottenAt)
      if (current.state === "pending" || current.state === "accepted") {
        this.db
          .prepare("UPDATE semantic_memories SET state = 'rejected', updated_at = ? WHERE id = ?")
          .run(forgottenAt, current.id)
      }
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
    return this.require(current.id)
  }

  invalidateSource(sourceKey: string, currentRevision: string): number {
    const invalidatedAt = this.clock()
    const result = this.db
      .prepare(
        `UPDATE semantic_memories SET state = 'invalidated', invalidated_at = ?, updated_at = ?
         WHERE id IN (
           SELECT memory_id FROM semantic_memory_evidence
           WHERE source_key = ? AND source_revision <> ?
         ) AND state <> 'invalidated'`,
      )
      .run(invalidatedAt, invalidatedAt, sourceKey, currentRevision)
    return Number(result.changes)
  }

  list(rawOptions: Partial<MemoryListQuery> = {}, scope?: MemoryScope): MemoryPage {
    const query = memoryListQuerySchema.parse(rawOptions)
    const records = this.selectPageRecords(query, scope)
    return {
      page: query.page,
      pageSize: query.pageSize,
      hasNextPage: records.length > query.pageSize,
      records: records.slice(0, query.pageSize),
    }
  }

  listPageCandidates(
    rawOptions: Partial<MemoryListQuery>,
    scope: MemoryScope,
  ): MemoryCandidatePage {
    const query = memoryListQuerySchema.parse(rawOptions)
    const candidates = this.selectPageRecords(query, scope, query.pageSize + 1)
    return {
      page: query.page,
      pageSize: query.pageSize,
      candidates,
      hasNextPage: candidates.length > query.pageSize,
    }
  }

  listAcceptedForScope(scope: MemoryScope, limit: number): readonly MemoryRecord[] {
    const rawRows = this.db
      .prepare(
        `SELECT * FROM semantic_memories
         WHERE scope_kind = ? AND scope_key = ? AND state = 'accepted'
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
      )
      .all(scope.kind, scope.key, limit)
    return rawRows.map((raw) => loadMemory(this.db, raw))
  }

  hasSourceOutsideScope(sourceKey: string, scope: MemoryScope): boolean {
    const raw = this.db
      .prepare(
        `SELECT 1
         FROM semantic_memory_evidence AS evidence
         INNER JOIN semantic_memories AS memories ON memories.id = evidence.memory_id
         WHERE evidence.source_key = ?
           AND (memories.scope_kind <> ? OR memories.scope_key <> ?)
         LIMIT 1`,
      )
      .get(sourceKey, scope.kind, scope.key)
    return raw !== undefined
  }

  retrieve(
    rawQuery: MemoryRetrievalQuery,
    candidates?: readonly MemoryRecord[],
  ): MemoryRetrievalResult {
    const query = memoryRetrievalQuerySchema.parse(rawQuery)
    const records =
      candidates ?? this.listAcceptedForScope(query.scope, MEMORY_RETRIEVAL_LIMITS.candidateLimit)
    return selectApprovedMemories(records, query)
  }

  recordNavigation(rawInput: MemoryNavigationInput): MemoryNavigationRecent {
    return recordNavigation(this.db, rawInput)
  }

  listNavigationRecents(scope: MemoryScope): readonly MemoryNavigationRecent[] {
    return listNavigationRecents(this.db, scope)
  }

  private selectPageRecords(
    query: MemoryListQuery,
    scope: MemoryScope | undefined,
    limit = query.pageSize + 1,
  ): readonly MemoryRecord[] {
    const conditions: string[] = []
    const parameters: Array<string | number> = []
    if (scope) {
      conditions.push("scope_kind = ?", "scope_key = ?")
      parameters.push(scope.kind, scope.key)
    }
    if (query.state) {
      conditions.push("state = ?")
      parameters.push(query.state)
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : ""
    parameters.push(limit, query.page * query.pageSize)
    const rawRows = this.db
      .prepare(
        `SELECT * FROM semantic_memories
         ${where}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...parameters)
    return rawRows.map((raw) => loadMemory(this.db, raw))
  }

  private transition(id: MemoryId, nextState: "accepted" | "rejected", expectedState: "pending") {
    const current = this.require(id)
    if (current.state !== expectedState) {
      throw new MemoryTransitionError(current.id, current.state, nextState)
    }
    const updatedAt = this.clock()
    this.db
      .prepare("UPDATE semantic_memories SET state = ?, updated_at = ? WHERE id = ?")
      .run(nextState, updatedAt, current.id)
    return this.require(current.id)
  }

  private require(id: MemoryId): MemoryRecord {
    const record = this.get(id)
    if (!record) throw new MemoryNotFoundError(id)
    return record
  }

  private findTombstone(
    derivationKey: MemoryDraft["derivationKey"],
    scope: MemoryScope,
  ): string | null {
    const raw = this.db
      .prepare(
        `SELECT derivation_key, scope_kind, scope_key, forgotten_at
         FROM semantic_memory_tombstones WHERE derivation_key = ? AND scope_kind = ? AND scope_key = ?`,
      )
      .get(derivationKey, scope.kind, scope.key)
    if (!raw) return null
    return tombstoneRowSchema.parse(raw).forgotten_at
  }
}

export class MemoryNotFoundError extends Error {
  readonly name = "MemoryNotFoundError"

  constructor(readonly memoryId: MemoryId) {
    super(`Memory ${memoryId} was not found`)
  }
}

export class MemoryTransitionError extends Error {
  readonly name = "MemoryTransitionError"

  constructor(
    readonly memoryId: MemoryId,
    readonly currentState: string,
    readonly requestedState: string,
  ) {
    super(`Memory ${memoryId} cannot transition from ${currentState} to ${requestedState}`)
  }
}
