import type { DatabaseSync } from "node:sqlite"

export function withKnowledgeSavepoint<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("SAVEPOINT knowledge_mutation")
  try {
    const result = operation()
    db.exec("RELEASE SAVEPOINT knowledge_mutation")
    return result
  } catch (error) {
    db.exec("ROLLBACK TO SAVEPOINT knowledge_mutation")
    db.exec("RELEASE SAVEPOINT knowledge_mutation")
    throw error
  }
}
