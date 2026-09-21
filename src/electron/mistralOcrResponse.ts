import { z } from "zod"
import {
  normalizeParsedDocumentPage,
  type ParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../shared/documentPageModel"
import type { Sha256 } from "../shared/schemas"

const mistralBlockTypeSchema = z.enum([
  "text",
  "title",
  "list",
  "table",
  "image",
  "equation",
  "caption",
  "code",
  "references",
  "aside_text",
  "header",
  "footer",
  "signature",
])

const mistralOcrResponseSchema = z.object({
  model: z.string().min(1),
  pages: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      markdown: z.string(),
      dimensions: z.object({
        width: z.number().positive(),
        height: z.number().positive(),
        dpi: z.number().positive().optional(),
      }),
      confidence_scores: z
        .object({
          average_page_confidence_score: z.number().min(0).max(1).nullable().optional(),
          minimum_page_confidence_score: z.number().min(0).max(1).nullable().optional(),
        })
        .passthrough()
        .nullable()
        .optional(),
      blocks: z.array(
        z.object({
          type: mistralBlockTypeSchema,
          top_left_x: z.number().finite(),
          top_left_y: z.number().finite(),
          bottom_right_x: z.number().finite(),
          bottom_right_y: z.number().finite(),
          content: z.string(),
          confidence_scores: z
            .object({
              average_content_confidence_score: z.number().min(0).max(1).nullable().optional(),
              minimum_content_confidence_score: z.number().min(0).max(1).nullable().optional(),
              block_type_confidence_score: z.number().min(0).max(1).nullable().optional(),
            })
            .passthrough()
            .nullable()
            .optional(),
        }),
      ),
    }),
  ),
  usage_info: z.object({ pages_processed: z.number().int().nonnegative() }).passthrough(),
})

function blockLabel(type: z.infer<typeof mistralBlockTypeSchema>, content: string) {
  switch (type) {
    case "title":
      return "paragraph_title" as const
    case "text":
    case "signature":
      return "text" as const
    case "references":
      return "references" as const
    case "caption": {
      if (/^\s*(?:table|tab\.?)\s*\d+(?:\s|[:.)-]|$)/iu.test(content)) return "table_title" as const
      if (/^\s*(?:figure|fig\.?)\s*\d+(?:\s|[:.)-]|$)/iu.test(content))
        return "figure_title" as const
      return "unknown" as const
    }
    case "image":
      return "image" as const
    case "equation":
      return "equation" as const
    case "table":
      return "table" as const
    case "list":
    case "code":
    case "aside_text":
    case "header":
    case "footer":
      return type
  }
}

function translationPolicy(type: z.infer<typeof mistralBlockTypeSchema>) {
  switch (type) {
    case "image":
    case "table":
    case "references":
    case "header":
    case "footer":
    case "signature":
      return "exclude" as const
    default:
      return "include" as const
  }
}

function contentFormat(type: z.infer<typeof mistralBlockTypeSchema>) {
  if (type === "image") return "none" as const
  if (type === "equation") return "latex" as const
  if (type === "table") return "markdown" as const
  return "text" as const
}

export function parsedPagesFromMistralResponse(
  value: unknown,
  sourceHash: Sha256,
): readonly ParsedDocumentPage[] {
  const response = mistralOcrResponseSchema.parse(value)
  return response.pages.map((page) => {
    const blocks = page.blocks.flatMap((block, order) => {
      const x = Math.max(0, Math.min(page.dimensions.width, block.top_left_x))
      const y = Math.max(0, Math.min(page.dimensions.height, block.top_left_y))
      const right = Math.max(x, Math.min(page.dimensions.width, block.bottom_right_x))
      const bottom = Math.max(y, Math.min(page.dimensions.height, block.bottom_right_y))
      if (right <= x || bottom <= y) return []
      return [
        {
          id: `page:${page.index + 1}:block:${order}`,
          label: blockLabel(block.type, block.content),
          order,
          bounds: { x, y, width: right - x, height: bottom - y },
          content: block.content,
          contentFormat: contentFormat(block.type),
          translationPolicy: translationPolicy(block.type),
          ...(block.confidence_scores === undefined
            ? {}
            : {
                confidence: block.confidence_scores?.average_content_confidence_score ?? null,
              }),
        },
      ]
    })
    return normalizeParsedDocumentPage(
      parsedDocumentPageSchema.parse({
        schemaVersion: "1.0.0",
        sourceHash,
        parser: "Mistral-OCR-4.1",
        configVersion: "blocks-v2",
        pageNumber: page.index + 1,
        width: page.dimensions.width,
        height: page.dimensions.height,
        provenance: {
          model: response.model,
          pageIndex: page.index,
          ...(page.confidence_scores === undefined
            ? {}
            : { confidence: page.confidence_scores?.average_page_confidence_score ?? null }),
        },
        blocks,
      }),
    )
  })
}
