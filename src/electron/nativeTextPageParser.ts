import { deriveDocumentReadingOrder } from "../renderer/lib/documentReadingOrder"
import type { SourceDocumentAst } from "../shared/documentAst"
import {
  type DocumentPageParseResult,
  normalizeParsedDocumentPage,
  type ParsedDocumentPage,
  type ParsedPageBlock,
} from "../shared/documentPageModel"
import { type Sha256, sha256Schema } from "../shared/schemas"

export type NativePageParserInput = {
  readonly ast: SourceDocumentAst
  readonly pageNumber: number
  readonly sourceHash: Sha256
  readonly width?: number
  readonly height?: number
}

function detectBlockLabel(text: string): ParsedPageBlock["label"] {
  const trimmed = text.trim()
  if (
    /^(?:[0-9]+(?:\.[0-9]+)*\s+)?(?:[A-Z][A-Za-z0-9\s]{2,50})$/.test(trimmed) &&
    trimmed.length < 80
  ) {
    if (
      /^[0-9]+\s+[A-Z]/.test(trimmed) ||
      /^(?:abstract|introduction|conclusion|references|related work)\b/i.test(trimmed)
    ) {
      return "paragraph_title"
    }
  }
  if (/^(?:Figure|Fig\.)\s+[0-9]+/i.test(trimmed)) return "figure_title"
  if (/^Table\s+[0-9]+/i.test(trimmed)) return "table_title"
  if (/^(?:figure|fig\.?|table|tab\.?|chart)\s*\d+/i.test(trimmed)) {
    if (/^(?:table|tab\.?)/i.test(trimmed)) return "table_title"
    if (/^chart/i.test(trimmed)) return "chart"
    return "figure_title"
  }
  if (/^(?:page\s+\d+|\d+\s*\/\s*\d+)$/i.test(trimmed)) return "page_number"
  if (/^[-*•]\s+/.test(trimmed) || /^[0-9]+[.)]\s+/.test(trimmed)) return "list"
  return "text"
}

function isExcludedFromTranslation(label: ParsedPageBlock["label"]): boolean {
  switch (label) {
    case "image":
    case "table":
    case "chart":
    case "figure_title":
    case "table_title":
    case "header":
    case "footer":
    case "page_number":
    case "aside_text":
    case "footnote":
    case "unknown":
      return true
    default:
      return false
  }
}

export function buildNativeParsedPage(
  input: NativePageParserInput,
): DocumentPageParseResult | null {
  const sourceHash = sha256Schema.parse(input.sourceHash)
  const pageId = `page:${input.pageNumber}`
  const astPage = input.ast.pages.find(
    (page) => page.id === pageId || page.page === input.pageNumber,
  )
  if (!astPage) return null

  const width = input.width ?? astPage.width
  const height = input.height ?? astPage.height
  const pageBlocks = input.ast.blocks.filter((block) => block.pageId === pageId)
  const itemMap = new Map(
    input.ast.items.filter((item) => item.pageId === pageId).map((item) => [item.id, item]),
  )
  const rawBlocks = pageBlocks.length > 0 ? pageBlocks : []

  const totalChars = input.ast.items
    .filter((item) => item.pageId === pageId)
    .reduce((sum, item) => sum + item.text.trim().length, 0)

  if (totalChars < 20) {
    return { status: "unavailable", reason: "needs_ocr" }
  }

  const readingOrder = deriveDocumentReadingOrder(input.ast)
  const orderedPage = readingOrder.pages.find((p) => p.pageId === pageId)
  const orderedBlocks = orderedPage?.blocks ?? []
  const sourceBlocks =
    orderedBlocks.length > 0
      ? orderedBlocks
      : rawBlocks.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
  const parsedBlocks: ParsedPageBlock[] = []
  for (let i = 0; i < sourceBlocks.length; i++) {
    const block = sourceBlocks[i]
    if (!block) continue
    const text = block.sourceItemIds
      .map((id) => itemMap.get(id)?.text ?? "")
      .filter(Boolean)
      .join(" ")
      .trim()
    if (!text) continue

    const label = detectBlockLabel(text)
    const blockBounds = {
      x: Math.max(0, Math.min(width - 1, block.bounds.x)),
      y: Math.max(0, Math.min(height - 1, block.bounds.y)),
      width: Math.max(1, Math.min(width - Math.max(0, block.bounds.x), block.bounds.width)),
      height: Math.max(1, Math.min(height - Math.max(0, block.bounds.y), block.bounds.height)),
    }

    parsedBlocks.push({
      id: `page:${input.pageNumber}:block:${parsedBlocks.length}`,
      label,
      order: parsedBlocks.length,
      bounds: blockBounds,
      content: text,
      contentFormat: "markdown",
      translationPolicy: isExcludedFromTranslation(label) ? "exclude" : "include",
    })
  }

  if (parsedBlocks.length === 0) {
    return { status: "unavailable", reason: "needs_ocr" }
  }

  const rawPage: ParsedDocumentPage = {
    schemaVersion: "1.0.0",
    sourceHash,
    parser: "NativeText-1.0",
    configVersion: "page-native-v1",
    pageNumber: input.pageNumber,
    width,
    height,
    blocks: parsedBlocks,
  }

  const page = normalizeParsedDocumentPage(rawPage)
  return { status: "ready", page }
}
