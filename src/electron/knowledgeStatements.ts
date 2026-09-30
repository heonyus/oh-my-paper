import type { DatabaseSync, StatementSync } from "node:sqlite"

const STATEMENTS_PER_CONNECTION = 128
const statementsByConnection = new WeakMap<DatabaseSync, Map<string, StatementSync>>()

/**
 * The prepared statement for a fixed SQL string, reused across calls because node:sqlite
 * compiles anew on every `prepare`. Pass only static SQL; values go in as parameters.
 */
export function cachedStatement(db: DatabaseSync, sql: string): StatementSync {
  let statements = statementsByConnection.get(db)
  if (!statements) {
    statements = new Map()
    statementsByConnection.set(db, statements)
  }
  const cached = statements.get(sql)
  if (cached) return cached
  if (statements.size >= STATEMENTS_PER_CONNECTION) statements.clear()
  const prepared = db.prepare(sql)
  statements.set(sql, prepared)
  return prepared
}
