import { z } from "zod"
import {
  type DocumentRow,
  documentRowSchema,
  type WebDocumentId,
  webDocumentIdSchema,
} from "./schemas"

const fields =
  "id, user_id, name, source_hash, object_key, status, page_count, error_code, created_at, updated_at"

export async function listOwnedDocuments(db: D1Database, userId: string): Promise<DocumentRow[]> {
  const result = await db
    .prepare(`SELECT ${fields} FROM documents WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all()
  return z.array(documentRowSchema).parse(result.results)
}

export async function findOwnedDocument(
  db: D1Database,
  userId: string,
  documentId: WebDocumentId,
): Promise<DocumentRow | null> {
  const row = await db
    .prepare(`SELECT ${fields} FROM documents WHERE id = ? AND user_id = ?`)
    .bind(documentId, userId)
    .first()
  return row ? documentRowSchema.parse(row) : null
}

export async function findOwnedDocumentByHash(
  db: D1Database,
  userId: string,
  sourceHash: string,
): Promise<DocumentRow | null> {
  const row = await db
    .prepare(`SELECT ${fields} FROM documents WHERE user_id = ? AND source_hash = ?`)
    .bind(userId, sourceHash)
    .first()
  return row ? documentRowSchema.parse(row) : null
}

export async function insertDocument(
  db: D1Database,
  input: {
    readonly id: WebDocumentId
    readonly userId: string
    readonly name: string
    readonly sourceHash: string
    readonly objectKey: string
  },
): Promise<DocumentRow> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO documents
       (id, user_id, name, source_hash, object_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
    )
    .bind(input.id, input.userId, input.name, input.sourceHash, input.objectKey, now, now)
    .run()
  const row = await findOwnedDocument(db, input.userId, input.id)
  if (!row) throw new Error("document_insert_failed")
  return row
}

export async function setDocumentStatus(
  db: D1Database,
  documentId: WebDocumentId,
  status: DocumentRow["status"],
  pageCount = 0,
  errorCode: string | null = null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE documents SET status = ?, page_count = ?, error_code = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(status, pageCount, errorCode, new Date().toISOString(), documentId)
    .run()
}

export function parsedPageKey(objectKey: string, pageNumber: number): string {
  return objectKey.replace(/\/source\.pdf$/u, `/pages/page-${pageNumber}.json`)
}

export function newWebDocumentId(): WebDocumentId {
  return webDocumentIdSchema.parse(crypto.randomUUID())
}
