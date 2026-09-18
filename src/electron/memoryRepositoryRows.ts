import { z } from "zod"
import {
  type MemoryRecord,
  memoryEvidenceSchema,
  memoryRecordSchema,
  memoryStateSchema,
} from "../shared/memorySchemas"

export const memoryRowSchema = z.object({
  id: z.string(),
  derivation_key: z.string(),
  text: z.string(),
  conservative_token_estimate: z.number(),
  scope_kind: z.string(),
  scope_key: z.string(),
  revision: z.number(),
  origin_kind: z.string(),
  origin_model_version: z.string().nullable(),
  state: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  invalidated_at: z.string().nullable(),
})

export const memoryEvidenceRowSchema = z.object({
  memory_id: z.string(),
  evidence_index: z.number(),
  kind: z.string(),
  source_key: z.string(),
  source_revision: z.string(),
  quote: z.string().nullable(),
  page: z.number().nullable(),
})

export const tombstoneRowSchema = z.object({
  derivation_key: z.string(),
  scope_kind: z.string(),
  scope_key: z.string(),
  forgotten_at: z.string(),
})

export const zNavigationRowSchema = z.object({
  id: z.number(),
  scope_kind: z.string(),
  scope_key: z.string(),
  kind: z.string(),
  fact: z.string(),
  source_key: z.string(),
  source_revision: z.string(),
  occurred_at: z.string(),
})

export function rowToMemory(raw: unknown, evidenceRows: readonly unknown[]): MemoryRecord {
  const row = memoryRowSchema.parse(raw)
  const evidence = evidenceRows
    .map((item) => memoryEvidenceRowSchema.parse(item))
    .sort((left, right) => left.evidence_index - right.evidence_index)
    .map((item) =>
      memoryEvidenceSchema.parse({
        kind: item.kind,
        sourceKey: item.source_key,
        sourceRevision: item.source_revision,
        quote: item.quote,
        page: item.page,
      }),
    )

  return memoryRecordSchema.parse({
    id: row.id,
    derivationKey: row.derivation_key,
    text: row.text,
    conservativeTokenEstimate: row.conservative_token_estimate,
    scope: { kind: row.scope_kind, key: row.scope_key },
    evidence,
    revision: row.revision,
    origin: { kind: row.origin_kind, modelVersion: row.origin_model_version },
    state: memoryStateSchema.parse(row.state),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    invalidatedAt: row.invalidated_at,
  })
}
