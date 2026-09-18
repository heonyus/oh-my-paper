import { z } from "zod"
import { documentIdSchema, sha256Schema } from "./schemas"

const parsedPageSchemaVersion = z.literal("1.0.0")
export const parsedPageParserSchema = z.enum([
  "PaddleOCR-VL-1.6",
  "Mistral-OCR-4.1",
  "NativeText-1.0",
])
export const parsedPageBlockLabelSchema = z.enum([
  "doc_title",
  "paragraph_title",
  "text",
  "list",
  "code",
  "equation",
  "image",
  "table",
  "chart",
  "figure_title",
  "table_title",
  "header",
  "footer",
  "page_number",
  "aside_text",
  "footnote",
  "unknown",
])
export const parsedPageBoundsSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
})
export const parsedPageBlockSchema = z.object({
  id: z.string().regex(/^page:[1-9][0-9]*:block:[0-9]+$/u),
  label: parsedPageBlockLabelSchema,
  order: z.number().int().nonnegative(),
  bounds: parsedPageBoundsSchema,
  content: z.string().max(40_000),
  contentFormat: z.enum(["text", "markdown", "latex", "html", "none"]),
  translationPolicy: z.enum(["include", "exclude"]),
})

export const parsedDocumentPageSchema = z
  .object({
    schemaVersion: parsedPageSchemaVersion,
    sourceHash: sha256Schema,
    parser: parsedPageParserSchema,
    configVersion: z.string().min(1).max(64),
    pageNumber: z.number().int().positive(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    blocks: z.array(parsedPageBlockSchema).max(1_024).readonly(),
  })
  .superRefine((page, context) => {
    const ids = new Set<string>()
    const orders = new Set<number>()
    for (const block of page.blocks) {
      if (ids.has(block.id) || orders.has(block.order)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate page block" })
      }
      ids.add(block.id)
      orders.add(block.order)
      if (
        !block.id.startsWith(`page:${page.pageNumber}:`) ||
        block.bounds.x + block.bounds.width > page.width ||
        block.bounds.y + block.bounds.height > page.height
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid page block bounds" })
      }
    }
  })

export const documentPageParseRequestSchema = z.object({
  id: documentIdSchema,
  pageNumber: z.number().int().positive(),
  forceOcr: z.boolean().optional(),
})

export const documentPageParseStageSchema = z.enum([
  "engine-starting",
  "page-rendering",
  "document-analyzing",
  "finalizing",
])
export const documentPageParseProgressSchema = documentPageParseRequestSchema.extend({
  stage: documentPageParseStageSchema,
})

export const documentPageParseResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), page: parsedDocumentPageSchema }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum([
      "unknown_document",
      "invalid_page",
      "needs_ocr",
      "runtime_missing",
      "provider_unconfigured",
      "model_unavailable",
      "invalid_output",
      "execution_failed",
    ]),
  }),
])

export type ParsedDocumentPage = z.infer<typeof parsedDocumentPageSchema>
export type ParsedPageBlock = z.infer<typeof parsedPageBlockSchema>
export type DocumentPageParseRequest = z.infer<typeof documentPageParseRequestSchema>
export type DocumentPageParseResult = z.infer<typeof documentPageParseResultSchema>
export type DocumentPageParseProgress = z.infer<typeof documentPageParseProgressSchema>

function intersectionRatio(
  left: ParsedPageBlock["bounds"],
  right: ParsedPageBlock["bounds"],
): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return (width * height) / Math.max(1, left.width * left.height)
}

export function normalizeParsedDocumentPage(page: ParsedDocumentPage): ParsedDocumentPage {
  const visualBlocks = page.blocks.filter(
    (block) => block.label === "image" || block.label === "table" || block.label === "chart",
  )
  return parsedDocumentPageSchema.parse({
    ...page,
    blocks: page.blocks.map((block) => {
      const nested =
        block.translationPolicy === "include" &&
        visualBlocks.some(
          (visual) =>
            visual.id !== block.id && intersectionRatio(block.bounds, visual.bounds) >= 0.5,
        )
      return nested ? { ...block, translationPolicy: "exclude" } : block
    }),
  })
}
