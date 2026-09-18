import type { DatabaseSync } from "node:sqlite"
import {
  type MemoryNavigationInput,
  type MemoryNavigationRecent,
  type MemoryScope,
  memoryNavigationInputSchema,
  memoryNavigationRecentSchema,
  memoryScopeSchema,
} from "../shared/memorySchemas"
import { zNavigationRowSchema } from "./memoryRepositoryRows"

export function recordNavigation(
  db: DatabaseSync,
  rawInput: MemoryNavigationInput,
): MemoryNavigationRecent {
  const input = memoryNavigationInputSchema.parse(rawInput)
  const result = db
    .prepare(
      `INSERT INTO factual_navigation_recents
       (scope_kind, scope_key, kind, fact, source_key, source_revision, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.scope.kind,
      input.scope.key,
      input.kind,
      input.fact,
      input.sourceKey,
      input.sourceRevision,
      input.occurredAt,
    )
  const id = Number(result.lastInsertRowid)
  db.prepare(
    `DELETE FROM factual_navigation_recents WHERE id NOT IN
     (SELECT id FROM factual_navigation_recents ORDER BY occurred_at DESC, id DESC LIMIT 100)`,
  ).run()
  return memoryNavigationRecentSchema.parse({ id, ...input })
}

export function listNavigationRecents(
  db: DatabaseSync,
  scope: MemoryScope,
): readonly MemoryNavigationRecent[] {
  const parsedScope = memoryScopeSchema.parse(scope)
  const rawRows = db
    .prepare(
      `SELECT * FROM factual_navigation_recents
       WHERE scope_kind = ? AND scope_key = ?
       ORDER BY occurred_at DESC, id DESC LIMIT 100`,
    )
    .all(parsedScope.kind, parsedScope.key)
  return rawRows.map((raw) => {
    const row = zNavigationRowSchema.parse(raw)
    return memoryNavigationRecentSchema.parse({
      id: row.id,
      scope: { kind: row.scope_kind, key: row.scope_key },
      kind: row.kind,
      fact: row.fact,
      sourceKey: row.source_key,
      sourceRevision: row.source_revision,
      occurredAt: row.occurred_at,
    })
  })
}
