import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api"
import { z } from "zod"
import {
  pageIdSchema,
  type SourceBlock,
  type SourceDocumentAst,
  type SourceLine,
  type SourceRawItem,
  sourceDocumentAstSchema,
  sourceItemIdSchema,
} from "../shared/documentAst"

export type SourceAstPageInput = {
  readonly page: number
  readonly width: number
  readonly height: number
  readonly items: readonly (TextItem | TextMarkedContent)[]
}

type Point = {
  readonly x: number
  readonly y: number
}

type CollectedTextItem = {
  readonly item: TextItem
  readonly sourceIndex: number
  readonly rawStart: number
  readonly rawEnd: number
}

type ExtractedSourceItem = {
  readonly source: SourceDocumentAst["items"][number]
  readonly raw: Omit<SourceRawItem, "lineId" | "blockId">
}

type PageExtraction = {
  readonly items: readonly SourceDocumentAst["items"][number][]
  readonly rawItems: readonly SourceRawItem[]
  readonly lines: readonly SourceLine[]
  readonly blocks: readonly SourceBlock[]
}

const extractorVersion = "pdfjs-6-source-1"
const transformSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])
type TextTransform = z.infer<typeof transformSchema>

export class SourceAstExtractionError extends Error {
  readonly name = "SourceAstExtractionError"

  constructor(readonly kind: "invalid_text_transform" | "invalid_text_bounds") {
    super(kind)
  }
}

function isTextItem(value: TextItem | TextMarkedContent): value is TextItem {
  return "str" in value
}

function normalizeText(value: string): string {
  return value.replace(/\s+\n/gu, "\n").trim()
}

function collectTextItems(items: readonly (TextItem | TextMarkedContent)[]): {
  readonly rawText: string
  readonly items: readonly CollectedTextItem[]
} {
  let rawText = ""
  const collected: CollectedTextItem[] = []
  for (const [sourceIndex, candidate] of items.entries()) {
    if (!isTextItem(candidate)) continue
    const rawStart = rawText.length
    rawText += candidate.str
    const rawEnd = rawText.length
    rawText += candidate.hasEOL ? "\n" : " "
    if (candidate.str.length > 0) collected.push({ item: candidate, sourceIndex, rawStart, rawEnd })
  }
  return { rawText, items: collected }
}

function transformedPoint(transform: TextTransform, x: number, y: number): Point {
  const [a, b, c, d, e, f] = transform
  return { x: a * x + c * y + e, y: b * x + d * y + f }
}

function boundsForItem(page: SourceAstPageInput, item: TextItem) {
  const transformResult = transformSchema.safeParse(item.transform)
  if (!transformResult.success) throw new SourceAstExtractionError("invalid_text_transform")
  const transform = transformResult.data
  const hScale = Math.hypot(transform[0], transform[1]) || 1
  const vScale = Math.hypot(transform[2], transform[3]) || 1
  const itemW = Number.isFinite(item.width) && item.width > 0 ? item.width : hScale * 0.5
  const itemH = Number.isFinite(item.height) && item.height > 0 ? item.height : vScale
  const h = { x: transform[0] / hScale, y: transform[1] / hScale }
  const v = { x: transform[2] / vScale, y: transform[3] / vScale }
  const points = [
    transformedPoint(transform, 0, 0),
    { x: transform[4] + h.x * itemW, y: transform[5] + h.y * itemW },
    { x: transform[4] + v.x * itemH, y: transform[5] + v.y * itemH },
    { x: transform[4] + h.x * itemW + v.x * itemH, y: transform[5] + h.y * itemW + v.y * itemH },
  ]
  const minX = Math.min(...points.map((p) => p.x))
  const maxX = Math.max(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y))
  const maxY = Math.max(...points.map((p) => p.y))
  const left = Math.max(0, Math.min(page.width - 0.1, minX))
  const right = Math.min(page.width, Math.max(left + 0.1, maxX))
  const top = Math.max(0, Math.min(page.height - 0.1, page.height - maxY))
  const bottom = Math.min(page.height, Math.max(top + 0.1, page.height - minY))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function unionBounds(
  left: SourceDocumentAst["items"][number]["bounds"],
  right: SourceDocumentAst["items"][number]["bounds"],
) {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const rightEdge = Math.max(left.x + left.width, right.x + right.width)
  const bottomEdge = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: rightEdge - x, height: bottomEdge - y }
}

function sameLine(
  left: ExtractedSourceItem,
  right: ExtractedSourceItem,
  pageWidth: number,
): boolean {
  const yDistance = Math.abs(left.source.bounds.y - right.source.bounds.y)
  const gap = Math.max(0, right.source.bounds.x - (left.source.bounds.x + left.source.bounds.width))
  return (
    yDistance <= Math.max(left.source.bounds.height, right.source.bounds.height) * 0.75 &&
    gap <= pageWidth * 0.25
  )
}

function sourceItemsForPage(page: SourceAstPageInput): PageExtraction {
  const collected = collectTextItems(page.items)
  const extracted: ExtractedSourceItem[] = collected.items.flatMap(
    ({ item, sourceIndex, rawStart, rawEnd }) => {
      const normalizedStart = collected.rawText
        .slice(0, rawStart)
        .replace(/\s+\n/gu, "\n")
        .trimStart().length
      const normalizedEnd = normalizeText(collected.rawText.slice(0, rawEnd)).length
      if (normalizedEnd <= normalizedStart) return []
      const bounds = boundsForItem(page, item)
      const id = sourceItemIdSchema.parse(`item:${page.page}.${sourceIndex}`)
      const pageId = pageIdSchema.parse(`page:${page.page}`)
      return [
        {
          source: { id, pageId, text: item.str, normalizedStart, normalizedEnd, bounds },
          raw: {
            id,
            pageId,
            text: item.str,
            rawStart,
            rawEnd,
            normalizedStart,
            normalizedEnd,
            transform: transformSchema.parse(item.transform),
            width: item.width > 0 ? item.width : bounds.width,
            height: item.height > 0 ? item.height : bounds.height,
            hasEOL: item.hasEOL,
            bounds,
          },
        },
      ]
    },
  )
  const groups: ExtractedSourceItem[][] = []
  for (const item of [...extracted].sort(
    (left, right) =>
      left.source.bounds.y - right.source.bounds.y || left.source.bounds.x - right.source.bounds.x,
  )) {
    const current = groups.at(-1)
    const previous = current?.at(-1)
    if (current && previous && sameLine(previous, item, page.width)) current.push(item)
    else groups.push([item])
  }
  const lines: SourceLine[] = []
  const blocks: SourceBlock[] = []
  const rawItems: SourceRawItem[] = []
  for (const [index, group] of groups.entries()) {
    const lineId = `line:${page.page}.${index}`
    const blockId = `block:${page.page}.${index}`
    const bounds = group
      .slice(1)
      .reduce(
        (current, item) => unionBounds(current, item.source.bounds),
        group[0]?.source.bounds ?? { x: 0, y: 0, width: 1, height: 1 },
      )
    const sourceItemIds = group.map((item) => item.source.id)
    const pageId = pageIdSchema.parse(`page:${page.page}`)
    lines.push({ id: lineId, pageId, sourceItemIds, bounds })
    blocks.push({ id: blockId, pageId, lineIds: [lineId], sourceItemIds, bounds })
    rawItems.push(...group.map((item) => ({ ...item.raw, lineId, blockId })))
  }
  return { items: extracted.map((item) => item.source), rawItems, lines, blocks }
}

export function buildSourceDocumentAst(
  sourceHash: string,
  pages: readonly SourceAstPageInput[],
): SourceDocumentAst {
  const extracted = pages.map(sourceItemsForPage)
  return sourceDocumentAstSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash,
    extractorVersion,
    pages: pages.map(({ page, width, height }) => ({
      id: pageIdSchema.parse(`page:${page}`),
      page,
      width,
      height,
    })),
    items: extracted.flatMap((page) => page.items),
    rawItems: extracted.flatMap((page) => page.rawItems),
    lines: extracted.flatMap((page) => page.lines),
    blocks: extracted.flatMap((page) => page.blocks),
  })
}
