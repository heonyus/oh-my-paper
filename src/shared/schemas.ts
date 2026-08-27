import { z } from "zod"
import { citationAssessmentResultSchema } from "./citationAssessment"

export const documentIdSchema = z
  .string()
  .regex(/^[a-f0-9]{16}$/)
  .brand("DocumentId")
export const cardIdSchema = z.string().uuid().brand("CardId")
export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .brand("Sha256")

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

export const viewportSchema = pointSchema.extend({
  zoom: z.number().min(0.38).max(1.5),
})

export const documentRecordSchema = z.object({
  id: documentIdSchema,
  name: z.string().min(1),
  hash: sha256Schema,
  bytes: z.number().int().positive(),
  importedAt: z.string().datetime(),
  pageCount: z.number().int().positive(),
  title: z.string().min(1),
  authors: z.array(z.string().min(1)),
  year: z.number().int().min(1000).max(9999).nullable(),
  doi: z.string().min(1).nullable(),
  quality: z.object({
    textCharacters: z.number().int().nonnegative(),
    needsOcr: z.boolean(),
    warnings: z.array(z.string()),
  }),
})

export const preparedPageSchema = z.object({
  page: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  text: z.string(),
})

export const preparedAnchorSchema = z.object({
  page: z.number().int().positive(),
  quote: z.string().min(1).max(4_000),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
})

export const preparedPdfSchema = z.object({
  hash: sha256Schema,
  pageCount: z.number().int().positive(),
  title: z.string().min(1),
  authors: z.array(z.string().min(1)),
  year: z.number().int().min(1000).max(9999).nullable(),
  doi: z.string().min(1).nullable(),
  pages: z.array(preparedPageSchema),
  anchors: z.array(preparedAnchorSchema),
  quality: documentRecordSchema.shape.quality,
})

export const sourceAnchorSchema = z.object({
  page: z.number().int().positive(),
  quote: z.string().min(1).max(4_000),
  x: z.number().finite(),
  y: z.number().finite(),
  fragments: z
    .array(
      z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().positive(),
        height: z.number().positive(),
      }),
    )
    .min(1)
    .max(128),
})

export const boardCardSchema = z.object({
  id: cardIdSchema,
  documentId: documentIdSchema,
  kind: z.enum(["translation", "explanation", "infographic", "note", "highlight", "citation"]),
  title: z.string().min(1),
  body: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  minimized: z.boolean(),
  sourceKey: z.string().min(1).max(512).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  sourceMeta: z
    .object({
      title: z.string().min(1),
      authors: z.array(z.string().min(1)),
      year: z.number().int().min(1000).max(9999).nullable(),
      venue: z.string(),
      abstract: z.string().nullable(),
      doi: z.string().nullable().optional(),
      url: z.string().url().nullable().optional(),
      citationCount: z.number().int().nonnegative().nullable(),
      assessment: citationAssessmentResultSchema.optional(),
    })
    .optional(),
  anchor: sourceAnchorSchema,
})

export const workspaceSchema = z.object({
  documents: z.array(documentRecordSchema),
  cards: z.array(boardCardSchema),
  sidebarOpen: z.boolean(),
  viewport: viewportSchema,
  activeDocumentId: documentIdSchema.nullable(),
})

export type DocumentId = z.infer<typeof documentIdSchema>
export type CardId = z.infer<typeof cardIdSchema>
export type Point = z.infer<typeof pointSchema>
export type Viewport = z.infer<typeof viewportSchema>
export type DocumentRecord = z.infer<typeof documentRecordSchema>
export type PreparedPdf = z.infer<typeof preparedPdfSchema>
export type SourceAnchor = z.infer<typeof sourceAnchorSchema>
export type SourceFragment = SourceAnchor["fragments"][number]
export type BoardCard = z.infer<typeof boardCardSchema>
export type Workspace = z.infer<typeof workspaceSchema>
