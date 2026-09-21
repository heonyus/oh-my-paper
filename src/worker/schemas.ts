import { z } from "zod"
import { parsedPageBoundsSchema } from "../shared/documentPageModel"
import { sha256Schema } from "../shared/schemas"

export const webDocumentIdSchema = z.string().uuid().brand<"WebDocumentId">()
export const webDocumentStatusSchema = z.enum(["queued", "analyzing", "ready", "failed"])

export const documentRowSchema = z.object({
  id: webDocumentIdSchema,
  user_id: z.string().min(1),
  name: z.string().min(1),
  source_hash: sha256Schema,
  object_key: z.string().min(1),
  status: webDocumentStatusSchema,
  page_count: z.number().int().nonnegative(),
  error_code: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const webDocumentSchema = z.object({
  id: webDocumentIdSchema,
  name: z.string().min(1),
  sourceHash: sha256Schema,
  status: webDocumentStatusSchema,
  pageCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export const webDocumentListSchema = z.object({ documents: z.array(webDocumentSchema) })

export const translationItemSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  translation: z.string(),
  kind: z.enum(["heading", "body", "equation"]),
  bounds: parsedPageBoundsSchema,
})

export const webPageTranslationSchema = z.object({
  documentId: webDocumentIdSchema,
  pageNumber: z.number().int().positive(),
  pageWidth: z.number().positive(),
  pageHeight: z.number().positive(),
  cached: z.boolean(),
  items: z.array(translationItemSchema),
})

export type WebDocumentId = z.infer<typeof webDocumentIdSchema>
export type DocumentRow = z.infer<typeof documentRowSchema>
export type WebPageTranslation = z.infer<typeof webPageTranslationSchema>

export function publicDocument(row: DocumentRow): z.infer<typeof webDocumentSchema> {
  return webDocumentSchema.parse({
    id: row.id,
    name: row.name,
    sourceHash: row.source_hash,
    status: row.status,
    pageCount: row.page_count,
    errorCode: row.error_code,
    createdAt: row.created_at,
  })
}
