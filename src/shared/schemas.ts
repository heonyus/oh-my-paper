import { z } from "zod"
import { citationAssessmentResultSchema } from "./citationAssessment"
import { researchSidebarLayout } from "./uiLayout"

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
  zoom: z.number().min(0.38).max(4),
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
  kind: z.enum([
    "translation",
    "explanation",
    "infographic",
    "note",
    "sticky",
    "highlight",
    "citation",
  ]),
  title: z.string().min(1),
  body: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  minimized: z.boolean(),
  width: z.number().min(240).max(720).default(300),
  height: z.number().min(160).max(900).nullable().default(null),
  loading: z.boolean().default(false),
  chat: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4_000),
      }),
    )
    .max(24)
    .default([]),
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

export const documentInsightKindSchema = z.enum(["keywords", "threeLines", "summary"])
export const documentInsightSchema = z.object({
  documentId: documentIdSchema,
  kind: documentInsightKindSchema,
  value: z.string().min(1),
  updatedAt: z.string().datetime(),
})

export const workspaceSchema = z.object({
  documents: z.array(documentRecordSchema),
  cards: z.array(boardCardSchema),
  insights: z.array(documentInsightSchema).default([]),
  sidebarOpen: z.boolean(),
  outlineWidth: z.number().min(200).max(420).default(240),
  researchSidebarWidth: z
    .number()
    .min(researchSidebarLayout.contentMinimum)
    .max(researchSidebarLayout.contentMaximum)
    .default(researchSidebarLayout.contentDefault),
  uiFontScale: z.number().min(0.9).max(1.2).default(1),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  minimapVisible: z.boolean().default(true),
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
export type DocumentInsight = z.infer<typeof documentInsightSchema>
export type DocumentInsightKind = z.infer<typeof documentInsightKindSchema>
export type Workspace = z.infer<typeof workspaceSchema>
