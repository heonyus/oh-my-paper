import { z } from "zod"
import { documentIdSchema, sha256Schema } from "./schemas"

export const documentLayoutLabelSchema = z.enum([
  "table",
  "chart",
  "image",
  "text",
  "equation",
  "code",
  "list",
  "paragraph_title",
  "doc_title",
  "figure_title",
  "header",
  "footer",
  "page_number",
  "aside_text",
  "page_footnote",
])

export const documentLayoutBoxSchema = z.object({
  label: documentLayoutLabelSchema,
  score: z.number().min(0).max(1),
  x: z.number().nonnegative().finite(),
  y: z.number().nonnegative().finite(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
  order: z.number().int().nonnegative().optional(),
  content: z.string().max(40_000).optional(),
})

export const documentLayoutPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
  parser: z.literal("mineru").optional(),
  boxes: z.array(documentLayoutBoxSchema),
})

export const documentLayoutSchema = z
  .object({
    version: z.union([z.literal(2), z.literal(3)]),
    model: z.enum(["PP-DocLayout_plus-L", "MinerU2.5-Pro-2605-1.2B"]),
    sourceHash: sha256Schema,
    pages: z.array(documentLayoutPageSchema),
  })
  .superRefine((layout, context) => {
    const validPair =
      (layout.version === 2 && layout.model === "PP-DocLayout_plus-L") ||
      (layout.version === 3 && layout.model === "MinerU2.5-Pro-2605-1.2B")
    if (!validPair)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid layout model" })
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
