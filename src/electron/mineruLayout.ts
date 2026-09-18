import { z } from "zod"
import {
  type DocumentLayout,
  type DocumentLayoutBox,
  documentLayoutSchema,
} from "../shared/documentLayout"
import { sha256Schema } from "../shared/schemas"

const boundsSchema = z
  .tuple([
    z.number().min(0).max(1_000),
    z.number().min(0).max(1_000),
    z.number().min(0).max(1_000),
    z.number().min(0).max(1_000),
  ])
  .refine(([x1, y1, x2, y2]) => x2 > x1 && y2 > y1)

const commonFields = {
  page_idx: z.number().int().nonnegative(),
  bbox: boundsSchema,
}

const mineruContentItemSchema = z.discriminatedUnion("type", [
  z.object({
    ...commonFields,
    type: z.literal("text"),
    text: z.string().min(1).max(40_000),
    text_level: z.number().int().nonnegative().optional(),
  }),
  z.object({
    ...commonFields,
    type: z.literal("equation"),
    text: z.string().min(1).max(40_000),
    text_format: z.literal("latex").optional(),
  }),
  z.object({
    ...commonFields,
    type: z.literal("image"),
    image_caption: z.array(z.string()).max(32).optional(),
  }),
  z.object({
    ...commonFields,
    type: z.literal("table"),
    table_caption: z.array(z.string()).max(32).optional(),
  }),
  z.object({
    ...commonFields,
    type: z.literal("chart"),
    chart_caption: z.array(z.string()).max(32).optional(),
    content: z.string().max(40_000).optional(),
  }),
  z.object({
    ...commonFields,
    type: z.literal("code"),
    code_body: z.string().min(1).max(40_000),
  }),
  z.object({
    ...commonFields,
    type: z.literal("list"),
    list_items: z.array(z.string()).min(1).max(512),
  }),
  z.object({
    ...commonFields,
    type: z.enum(["header", "footer", "page_number", "aside_text", "page_footnote"]),
    text: z.string().max(40_000).optional(),
  }),
])

const mineruContentListSchema = z.array(mineruContentItemSchema).min(1).max(20_000)
type MineruContentItem = z.infer<typeof mineruContentItemSchema>

function labelFor(item: MineruContentItem): DocumentLayoutBox["label"] {
  switch (item.type) {
    case "text":
      return (item.text_level ?? 0) > 0 ? "paragraph_title" : "text"
    case "equation":
      return "equation"
    case "image":
      return "image"
    case "table":
      return "table"
    case "chart":
      return "chart"
    case "code":
      return "code"
    case "list":
      return "list"
    case "header":
      return "header"
    case "footer":
      return "footer"
    case "page_number":
      return "page_number"
    case "aside_text":
      return "aside_text"
    case "page_footnote":
      return "page_footnote"
  }
}

function contentFor(item: MineruContentItem): string | undefined {
  switch (item.type) {
    case "text":
    case "equation":
      return item.text
    case "image":
      return item.image_caption?.join("\n")
    case "table":
      return item.table_caption?.join("\n")
    case "chart":
      return item.chart_caption?.join("\n") ?? item.content
    case "code":
      return item.code_body
    case "list":
      return item.list_items.join("\n")
    case "header":
    case "footer":
    case "page_number":
    case "aside_text":
    case "page_footnote":
      return item.text
  }
}

export function mineruContentListToLayout(sourceHash: string, value: unknown): DocumentLayout {
  const hash = sha256Schema.parse(sourceHash)
  const items = mineruContentListSchema.parse(value)
  const pages = new Map<number, DocumentLayoutBox[]>()
  for (const [order, item] of items.entries()) {
    const [x1, y1, x2, y2] = item.bbox
    const content = contentFor(item)?.trim()
    const box: DocumentLayoutBox = {
      label: labelFor(item),
      score: 1,
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
      order,
      ...(content ? { content } : {}),
    }
    const pageNumber = item.page_idx + 1
    pages.set(pageNumber, [...(pages.get(pageNumber) ?? []), box])
  }
  return documentLayoutSchema.parse({
    version: 3,
    model: "MinerU2.5-Pro-2605-1.2B",
    sourceHash: hash,
    pages: [...pages.entries()]
      .sort(([left], [right]) => left - right)
      .map(([pageNumber, boxes]) => ({
        pageNumber,
        width: 1_000,
        height: 1_000,
        parser: "mineru",
        boxes,
      })),
  })
}
