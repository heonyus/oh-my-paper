import { z } from "zod"
import { agentThreadSchema } from "./agentChat"
import { citationAssessmentResultSchema } from "./citationAssessment"
import { cardIdSchema, documentIdSchema, sha256Schema } from "./ids"
import { READER_NOTES_MAX, readerNoteSchema } from "./readerNote"
import { researchSidebarLayout } from "./uiLayout"

export { cardIdSchema, documentIdSchema, sha256Schema }

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

export const viewportSchema = pointSchema.extend({
  zoom: z.number().min(0.38).max(4),
})

export const documentKindSchema = z.enum([
  "research_paper",
  "report",
  "manual",
  "contract",
  "presentation",
  "document",
])

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
  kind: documentKindSchema.default("document"),
  overview: z.string().max(8_000).default(""),
  lastReadPage: z.number().int().positive().optional(),
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
  kind: documentKindSchema.default("document"),
  overview: z.string().max(8_000).default(""),
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
    .max(128),
  astRanges: z
    .array(
      z.object({
        sourceItemId: z.string().regex(/^item:[a-zA-Z0-9._-]+$/),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
      }),
    )
    .max(128)
    .optional(),
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

export const uiFontFamilySchema = z.enum(["wanted", "pretendard", "suit", "geist-wanted", "system"])
export const appearanceThemeSchema = z.enum(["system", "light", "dark"])
export const appearancePreferencesSchema = z.object({
  uiFontFamily: uiFontFamilySchema.default("wanted"),
  uiFontScale: z.number().min(0.5).max(2).default(1),
  theme: appearanceThemeSchema.default("system"),
})

export const workspaceSchema = z.object({
  revision: z.number().int().nonnegative().optional(),
  baseRevision: z.number().int().nonnegative().optional(),
  snapshotToken: sha256Schema.optional(),
  baseSnapshotToken: sha256Schema.optional(),
  documents: z.array(documentRecordSchema),
  cards: z.array(boardCardSchema),
  agentThreads: z.array(agentThreadSchema).default([]),
  insights: z.array(documentInsightSchema).default([]),
  readerNotes: z.array(readerNoteSchema).max(READER_NOTES_MAX).default([]),
  sidebarOpen: z.boolean(),
  outlineWidth: z.number().min(200).max(420).default(240),
  researchSidebarWidth: z
    .number()
    .min(researchSidebarLayout.contentMinimum)
    .max(researchSidebarLayout.contentMaximum)
    .default(researchSidebarLayout.contentDefault),
  uiFontFamily: uiFontFamilySchema.default("wanted"),
  uiFontScale: z.number().min(0.5).max(2).default(1),
  theme: appearanceThemeSchema.default("system"),
  minimapVisible: z.boolean().default(true),
  viewport: viewportSchema,
  activeDocumentId: documentIdSchema.nullable(),
})

export type DocumentId = z.infer<typeof documentIdSchema>
export type Sha256 = z.infer<typeof sha256Schema>
export type CardId = z.infer<typeof cardIdSchema>
export type Point = z.infer<typeof pointSchema>
export type Viewport = z.infer<typeof viewportSchema>
export type DocumentRecord = z.infer<typeof documentRecordSchema>
export type DocumentKind = z.infer<typeof documentKindSchema>
export type PreparedPdf = z.infer<typeof preparedPdfSchema>
export type SourceAnchor = z.infer<typeof sourceAnchorSchema>
export type SourceFragment = SourceAnchor["fragments"][number]
export type BoardCard = z.infer<typeof boardCardSchema>
export type DocumentInsight = z.infer<typeof documentInsightSchema>
export type DocumentInsightKind = z.infer<typeof documentInsightKindSchema>
export type UiFontFamily = z.infer<typeof uiFontFamilySchema>
export type AppearanceTheme = z.infer<typeof appearanceThemeSchema>
export type AppearancePreferences = z.infer<typeof appearancePreferencesSchema>
export type Workspace = z.infer<typeof workspaceSchema>
