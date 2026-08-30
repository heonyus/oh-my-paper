import { z } from "zod"
import { documentIdSchema, sha256Schema } from "./schemas"

export const documentLayoutLabelSchema = z.enum([
  "table",
  "chart",
  "image",
  "paragraph_title",
  "doc_title",
  "figure_title",
])

export const documentLayoutBoxSchema = z.object({
  label: documentLayoutLabelSchema,
  score: z.number().min(0).max(1),
  x: z.number().nonnegative().finite(),
  y: z.number().nonnegative().finite(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
})

export const documentLayoutPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
  boxes: z.array(documentLayoutBoxSchema),
})

export const documentLayoutSchema = z.object({
  version: z.literal(2),
  model: z.literal("PP-DocLayout_plus-L"),
  sourceHash: sha256Schema,
  pages: z.array(documentLayoutPageSchema),
})

export const documentLayoutRequestSchema = z.object({ id: documentIdSchema })
export const documentLayoutResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), layout: documentLayoutSchema }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum(["runtime_missing", "analysis_failed"]),
  }),
])

export type DocumentLayout = z.infer<typeof documentLayoutSchema>
export type DocumentLayoutPage = z.infer<typeof documentLayoutPageSchema>
export type DocumentLayoutBox = z.infer<typeof documentLayoutBoxSchema>
export type DocumentLayoutResult = z.infer<typeof documentLayoutResultSchema>
