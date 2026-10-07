import { deriveDocumentReadingOrder } from "../renderer/lib/documentReadingOrder"
import type { SourceDocumentAst, SourceRawItem } from "../shared/documentAst"
import {
  type DocumentPageParseResult,
  normalizeParsedDocumentPage,
  type ParsedDocumentPage,
  type ParsedPageBlock,
} from "../shared/documentPageModel"
import { type Sha256, sha256Schema } from "../shared/schemas"
import { joinLineText } from "./citationSuperscripts"

export type NativePageParserInput = {
  readonly ast: SourceDocumentAst
  readonly pageNumber: number
  readonly sourceHash: Sha256
  readonly width?: number
  readonly height?: number
}

const readingOrders = new WeakMap<
  SourceDocumentAst,
  ReturnType<typeof deriveDocumentReadingOrder>
>()

/** The document's reading order, worked out once per AST rather than once per page. */
function readingOrderOf(ast: SourceDocumentAst): ReturnType<typeof deriveDocumentReadingOrder> {
  const known = readingOrders.get(ast)
  if (known) return known
  const order = deriveDocumentReadingOrder(ast)
  readingOrders.set(ast, order)
  return order
}

type NativeTextUnit = {
  readonly sourceItemIds: readonly SourceRawItem["id"][]
  readonly bounds: SourceRawItem["bounds"]
}

function sideways(item: SourceRawItem): boolean {
  const [a, b] = item.transform
  return Math.abs(b) > Math.abs(a)
}

function streamTextUnits(ast: SourceDocumentAst, pageId: string): readonly NativeTextUnit[] {
  const groups: SourceRawItem[][] = []
  for (const item of ast.rawItems
    .filter((candidate) => candidate.pageId === pageId)
    .sort((left, right) => left.rawStart - right.rawStart)) {
    const current = groups.at(-1)
    const previous = current?.at(-1)
    const previousCenter = previous ? previous.bounds.y + previous.bounds.height / 2 : 0
    const center = item.bounds.y + item.bounds.height / 2
    const lineShift = previous
      ? Math.abs(center - previousCenter) >
        Math.max(previous.bounds.height, item.bounds.height) * 1.5
      : false
    // Text set sideways — a preprint's arXiv stamp — is never part of the line before it.
    const turn = previous ? sideways(previous) !== sideways(item) : false
    if (!current || previous?.hasEOL || lineShift || turn) groups.push([item])
    else current.push(item)
  }
  return groups.map((items) => {
    const x = Math.min(...items.map((item) => item.bounds.x))
    const y = Math.min(...items.map((item) => item.bounds.y))
    const right = Math.max(...items.map((item) => item.bounds.x + item.bounds.width))
    const bottom = Math.max(...items.map((item) => item.bounds.y + item.bounds.height))
    return {
      sourceItemIds: items.map((item) => item.id),
      bounds: { x, y, width: right - x, height: bottom - y },
    }
  })
}

function detectBlockLabel(text: string): ParsedPageBlock["label"] {
  const trimmed = text.trim()
  if (/^[0-9]+(?:\.[0-9]+)*\s+\S/u.test(trimmed) && trimmed.length < 80) return "paragraph_title"
  if (
    /^(?:[0-9]+(?:\.[0-9]+)*\s+)?(?:[A-Z][A-Za-z0-9\s]{2,50})$/.test(trimmed) &&
    trimmed.length < 80
  ) {
    if (
      /^[0-9]+(?:\.[0-9]+)*\s+[A-Z]/.test(trimmed) ||
      /^(?:abstract|introduction|conclusion|references|related work)\b/i.test(trimmed)
    ) {
      return "paragraph_title"
    }
  }
  if (/^(?:Figure|Fig\.)\s+[0-9]+\s*[:.]/i.test(trimmed)) return "figure_title"
  if (/^Table\s+[0-9]+\s*[:.]/i.test(trimmed)) return "table_title"
  if (/^(?:figure|fig\.?|table|tab\.?|chart)\s*\d+\s*[:.]/i.test(trimmed)) {
    if (/^(?:table|tab\.?)/i.test(trimmed)) return "table_title"
    if (/^chart/i.test(trimmed)) return "chart"
    return "figure_title"
  }
  if (/^(?:page\s+\d+|\d+|\d+\s*\/\s*\d+)$/i.test(trimmed)) return "page_number"
  if (/^[-*•]\s+/.test(trimmed) || /^[0-9]+[.)]\s+/.test(trimmed)) return "list"
  return "text"
}

function isExcludedFromTranslation(label: ParsedPageBlock["label"]): boolean {
  switch (label) {
    case "image":
    case "table":
    case "chart":
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
  const pageLines = input.ast.lines.filter((line) => line.pageId === pageId)
  const itemMap = new Map(
    input.ast.rawItems.filter((item) => item.pageId === pageId).map((item) => [item.id, item]),
  )

  const totalChars = input.ast.items
    .filter((item) => item.pageId === pageId)
    .reduce((sum, item) => sum + item.text.trim().length, 0)

  if (totalChars < 20) {
    return { status: "unavailable", reason: "needs_ocr" }
  }

  const streamUnits = streamTextUnits(input.ast, pageId)
  const readingOrder = readingOrderOf(input.ast)
  const orderedPage = readingOrder.pages.find((p) => p.pageId === pageId)
  const lineMap = new Map((orderedPage?.lines ?? pageLines).map((line) => [line.id, line]))
  const orderedLines = (orderedPage?.orderedLineIds ?? []).flatMap((id) => {
    const line = lineMap.get(id)
    return line ? [line] : []
  })
  const sourceBlocks =
    streamUnits.length > 0
      ? streamUnits
      : orderedLines.length > 0
        ? orderedLines
        : pageLines.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
  const parsedBlocks: ParsedPageBlock[] = []
  const continuedCaptions = new Set<string>()
  for (let i = 0; i < sourceBlocks.length; i++) {
    const block = sourceBlocks[i]
    if (!block) continue
    const text = joinLineText(
      block.sourceItemIds
        .flatMap((id) => {
          const item = itemMap.get(id)
          return item ? [item] : []
        })
        .sort((left, right) => left.normalizedStart - right.normalizedStart),
    )
    if (!text) continue

    const detectedLabel = detectBlockLabel(text)
    const blockBounds = {
      x: Math.max(0, Math.min(width - 1, block.bounds.x)),
      y: Math.max(0, Math.min(height - 1, block.bounds.y)),
      width: Math.max(1, Math.min(width - Math.max(0, block.bounds.x), block.bounds.width)),
      height: Math.max(1, Math.min(height - Math.max(0, block.bounds.y), block.bounds.height)),
    }

    const previous = parsedBlocks.at(-1)
    const previousBottom = previous ? previous.bounds.y + previous.bounds.height : 0
    const continuesCaption =
      detectedLabel === "text" &&
      (previous?.label === "figure_title" || previous?.label === "table_title") &&
      !continuedCaptions.has(previous.id) &&
      /^(?:figure|fig\.?|table|tab\.?)\s*[0-9]+\s*[:.]/iu.test(previous.content) &&
      previous.bounds.height <= blockBounds.height * 1.8 &&
      blockBounds.y - previousBottom <= Math.max(previous.bounds.height, blockBounds.height) * 1.5
    if (continuesCaption && previous) {
      continuedCaptions.add(previous.id)
      const x = Math.min(previous.bounds.x, blockBounds.x)
      const y = Math.min(previous.bounds.y, blockBounds.y)
      const right = Math.max(
        previous.bounds.x + previous.bounds.width,
        blockBounds.x + blockBounds.width,
      )
      const bottom = Math.max(
        previous.bounds.y + previous.bounds.height,
        blockBounds.y + blockBounds.height,
      )
      parsedBlocks[parsedBlocks.length - 1] = {
        ...previous,
        bounds: { x, y, width: right - x, height: bottom - y },
        content: `${previous.content} ${text}`,
      }
      continue
    }
    const label = detectedLabel
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
    configVersion: "page-native-v2",
    pageNumber: input.pageNumber,
    width,
    height,
    blocks: parsedBlocks,
  }

  const page = normalizeParsedDocumentPage(rawPage)
  return { status: "ready", page }
}
