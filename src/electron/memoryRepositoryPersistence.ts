import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import {
  type MemoryDraft,
  type MemoryRecord,
  memoryIdSchema,
  memoryRecordSchema,
} from "../shared/memorySchemas"
import { memoryEvidenceRowSchema, memoryRowSchema, rowToMemory } from "./memoryRepositoryRows"
import { estimateConservativeTokens } from "./memoryRetrieval"

export type MemoryPersistenceContext = Readonly<{
  readonly db: DatabaseSync
  readonly clock: () => string
}>

export function insertMemory(
  context: MemoryPersistenceContext,
  draft: MemoryDraft,
  state: "pending" | "accepted",
): MemoryRecord {
  const now = context.clock()
  const conservativeTokenEstimate = Math.max(
    draft.conservativeTokenEstimate ?? 0,
    estimateConservativeTokens(draft.text),
  )
  const record = memoryRecordSchema.parse({
    id: memoryIdSchema.parse(randomUUID()),
    ...draft,
    conservativeTokenEstimate,
    state,
    createdAt: now,
    updatedAt: now,
    invalidatedAt: null,
  })
  context.db
    .prepare(
      `INSERT INTO semantic_memories
       (id, derivation_key, text, conservative_token_estimate, scope_kind, scope_key, revision,
        origin_kind, origin_model_version, state, created_at, updated_at, invalidated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.id,
      record.derivationKey,
      record.text,
      record.conservativeTokenEstimate,
      record.scope.kind,
      record.scope.key,
      record.revision,
      record.origin.kind,
      record.origin.modelVersion,
      record.state,
      record.createdAt,
      record.updatedAt,
      record.invalidatedAt,
    )
  const evidenceStatement = context.db.prepare(
    `INSERT INTO semantic_memory_evidence
     (memory_id, evidence_index, kind, source_key, source_revision, quote, page)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  record.evidence.forEach((evidence, index) => {
    evidenceStatement.run(
      record.id,
      index,
      evidence.kind,
      evidence.sourceKey,
      evidence.sourceRevision,
      evidence.quote,
      evidence.page,
    )
  })
  return record
}

export function loadMemory(db: DatabaseSync, raw: unknown): MemoryRecord {
  const row = memoryRowSchema.parse(raw)
  const evidenceRows = db
    .prepare(
      `SELECT memory_id, evidence_index, kind, source_key, source_revision, quote, page
       FROM semantic_memory_evidence WHERE memory_id = ? ORDER BY evidence_index ASC`,
    )
    .all(row.id)
  return rowToMemory(
    row,
    evidenceRows.map((item) => memoryEvidenceRowSchema.parse(item)),
  )
}
