import { z } from "zod"
import type { SourceDocumentAst } from "../../shared/documentAst"

export const semanticKinds = [
  "heading",
  "paragraph",
  "table",
  "figure",
  "chart",
  "equation",
  "caption",
  "footnote",
  "header",
  "footer",
  "image",
  "ocr_block",
  "unknown",
] as const

export type SemanticKind = (typeof semanticKinds)[number]
export type SemanticNodeKind = SemanticKind | "citation_occurrence" | "citation_reference"
export type SourcePageId = SourceDocumentAst["pages"][number]["id"]
export type SourceItemId = SourceDocumentAst["items"][number]["id"]
export type PageBounds = SourceDocumentAst["items"][number]["bounds"]

const semanticNodeIdSchema = z
  .string()
  .regex(/^node:[a-zA-Z0-9._-]+$/u)
  .brand("LocalSemanticNodeId")

export type LocalSemanticNodeId = z.infer<typeof semanticNodeIdSchema>

export type SourceRange = {
  readonly pageId: SourcePageId
  readonly start: number
  readonly end: number
  readonly sourceItemIds: readonly SourceItemId[]
}

export type LocalSemanticNode = {
  readonly id: LocalSemanticNodeId
  readonly kind: SemanticNodeKind
  readonly pageId: SourcePageId
  readonly sourceItemIds: readonly SourceItemId[]
  readonly sourceRange: SourceRange
  readonly text: string
  readonly bounds: PageBounds
  readonly confidence: number
  readonly reasons: readonly string[]
}

export type LocalSemanticEdgeKind = "parent" | "child" | "order" | "caption" | "reference"

export type LocalSemanticEdge = {
  readonly from: LocalSemanticNodeId
  readonly to: LocalSemanticNodeId
  readonly kind: LocalSemanticEdgeKind
  readonly confidence: number
  readonly reasons: readonly string[]
}

export type CaptionOwnership =
  | { readonly status: "owned"; readonly captionId: string; readonly ownerId: string }
  | {
      readonly status: "ambiguous"
      readonly captionId: string
      readonly candidateIds: readonly string[]
    }
  | { readonly status: "unowned"; readonly captionId: string }

export function stableSemanticNodeId(
  kind: SemanticNodeKind,
  range: SourceRange,
): LocalSemanticNodeId {
  const page = range.pageId.replace(/^page:/u, "")
  const items = range.sourceItemIds.map((id) => id.replaceAll(":", "-")).join("-")
  return semanticNodeIdSchema.parse(`node:${kind}-${page}-${range.start}-${range.end}-${items}`)
}

export function pageItems(
  source: SourceDocumentAst,
  pageId: SourcePageId,
): readonly SourceDocumentAst["items"][number][] {
  return source.items
    .filter((item) => item.pageId === pageId)
    .sort(
      (left, right) =>
        left.normalizedStart - right.normalizedStart || left.id.localeCompare(right.id),
    )
}

export function pageText(source: SourceDocumentAst, pageId: SourcePageId): string {
  const items = pageItems(source, pageId)
  const length = items.reduce((maximum, item) => Math.max(maximum, item.normalizedEnd), 0)
  const characters = new Array<string>(length).fill(" ")
  for (const item of items) {
    const limit = Math.min(item.text.length, item.normalizedEnd - item.normalizedStart)
    for (let index = 0; index < limit; index += 1) {
      const character = item.text[index]
      if (character !== undefined) characters[item.normalizedStart + index] = character
    }
  }
  return characters.join("")
}

export function itemIdsForRange(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  start: number,
  end: number,
): readonly SourceItemId[] {
  return pageItems(source, pageId)
    .filter((item) => item.normalizedStart < end && item.normalizedEnd > start)
    .map((item) => item.id)
}

export function rangeForItems(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  sourceItemIds: readonly SourceItemId[],
): SourceRange | null {
  const selected = source.items.filter(
    (item) => item.pageId === pageId && sourceItemIds.includes(item.id),
  )
  const first = selected[0]
  if (!first) return null
  return {
    pageId,
    start: Math.min(...selected.map((item) => item.normalizedStart)),
    end: Math.max(...selected.map((item) => item.normalizedEnd)),
    sourceItemIds: pageItems(source, pageId)
      .filter((item) => selected.some((candidate) => candidate.id === item.id))
      .map((item) => item.id),
  }
}

export function boundsForItems(
  source: SourceDocumentAst,
  sourceItemIds: readonly SourceItemId[],
): PageBounds | null {
  const selected = source.items.filter((item) => sourceItemIds.includes(item.id))
  const first = selected[0]
  if (!first) return null
  const left = Math.min(...selected.map((item) => item.bounds.x))
  const top = Math.min(...selected.map((item) => item.bounds.y))
  const right = Math.max(...selected.map((item) => item.bounds.x + item.bounds.width))
  const bottom = Math.max(...selected.map((item) => item.bounds.y + item.bounds.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function makeSemanticNode(
  source: SourceDocumentAst,
  kind: SemanticNodeKind,
  pageId: SourcePageId,
  sourceItemIds: readonly SourceItemId[],
  confidence: number,
  reasons: readonly string[],
): LocalSemanticNode | null {
  const sourceRange = rangeForItems(source, pageId, sourceItemIds)
  const bounds = boundsForItems(source, sourceItemIds)
  if (!sourceRange || !bounds) return null
  return {
    id: stableSemanticNodeId(kind, sourceRange),
    kind,
    pageId,
    sourceItemIds: sourceRange.sourceItemIds,
    sourceRange,
    text: pageText(source, pageId).slice(sourceRange.start, sourceRange.end).trim(),
    bounds,
    confidence,
    reasons,
  }
}
