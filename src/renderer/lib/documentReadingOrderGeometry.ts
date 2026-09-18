import type { SourceDocumentAst, SourceRawItem } from "../../shared/documentAst"
import type { Orientation, ReadingBlock, ReadingLine } from "./documentReadingOrderTypes"
import {
  boundsForItems,
  type PageBounds,
  pageItems,
  rangeForItems,
  type SourceItemId,
  type SourcePageId,
} from "./documentSemanticTypes"

type WorkingItem = {
  readonly id: SourceItemId
  readonly bounds: PageBounds
  readonly orientation: Orientation
  readonly direction: "ltr" | "rtl"
  readonly alongStart: number
  readonly alongEnd: number
  readonly crossCenter: number
  readonly hasEOL: boolean
}

type MutableLine = {
  items: WorkingItem[]
  orientation: Orientation
  direction: "ltr" | "rtl"
}

function rawItemMap(source: SourceDocumentAst): ReadonlyMap<SourceItemId, SourceRawItem> {
  return new Map(source.rawItems.map((item) => [item.id, item] as const))
}

function orientationFor(raw: SourceRawItem | undefined): Orientation {
  if (!raw) return "horizontal"
  const angle = Math.abs((Math.atan2(raw.transform[1], raw.transform[0]) * 180) / Math.PI) % 180
  return angle > 45 && angle < 135 ? "vertical" : "horizontal"
}

function directionFor(raw: SourceRawItem | undefined, orientation: Orientation): "ltr" | "rtl" {
  if (orientation === "horizontal" && raw?.transform[0] !== undefined && raw.transform[0] < 0)
    return "rtl"
  return "ltr"
}

function itemOverlap(left: WorkingItem, right: WorkingItem): number {
  return Math.min(left.alongEnd, right.alongEnd) - Math.max(left.alongStart, right.alongStart)
}

function workingItems(source: SourceDocumentAst, pageId: SourcePageId): readonly WorkingItem[] {
  const raws = rawItemMap(source)
  return pageItems(source, pageId).map((item) => {
    const raw = raws.get(item.id)
    const orientation = orientationFor(raw)
    const direction = directionFor(raw, orientation)
    const alongStart = orientation === "horizontal" ? item.bounds.x : item.bounds.y
    const alongEnd =
      orientation === "horizontal"
        ? item.bounds.x + item.bounds.width
        : item.bounds.y + item.bounds.height
    const crossCenter =
      orientation === "horizontal"
        ? item.bounds.y + item.bounds.height / 2
        : item.bounds.x + item.bounds.width / 2
    return {
      id: item.id,
      bounds: item.bounds,
      orientation,
      direction,
      alongStart,
      alongEnd,
      crossCenter,
      hasEOL: raw?.hasEOL ?? false,
    }
  })
}

function belongsToLine(line: MutableLine, item: WorkingItem): boolean {
  const last = line.items[line.items.length - 1]
  if (
    !last ||
    line.orientation !== item.orientation ||
    line.direction !== item.direction ||
    last.hasEOL
  )
    return false
  const crossDistance = Math.abs(last.crossCenter - item.crossCenter)
  const crossLimit = Math.max(last.bounds.height, item.bounds.height) * 0.75
  const gap = item.alongStart - last.alongEnd
  const gapLimit = Math.max(12, Math.max(last.bounds.height, item.bounds.height) * 2.25)
  return crossDistance <= crossLimit && gap <= gapLimit && itemOverlap(last, item) <= 0
}

function lineId(pageId: SourcePageId, sourceItemIds: readonly SourceItemId[]): string {
  const page = pageId.replace(/^page:/u, "")
  const items = sourceItemIds.map((id) => id.replaceAll(":", "-")).join("-")
  return `line:${page}-${items}`
}

function blockId(pageId: SourcePageId, lineIds: readonly string[]): string {
  const page = pageId.replace(/^page:/u, "")
  return `block:${page}-${lineIds.map((id) => id.replace(/^line:/u, "")).join("-")}`
}

export function overlaps(left: PageBounds, right: PageBounds): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  )
}

export function makeLines(source: SourceDocumentAst, pageId: SourcePageId): readonly ReadingLine[] {
  const builders: MutableLine[] = []
  const items = [...workingItems(source, pageId)].sort(
    (left, right) =>
      left.crossCenter - right.crossCenter ||
      left.alongStart - right.alongStart ||
      left.id.localeCompare(right.id),
  )
  for (const item of items) {
    const candidate = builders.find((line) => belongsToLine(line, item))
    if (candidate) candidate.items.push(item)
    else builders.push({ items: [item], orientation: item.orientation, direction: item.direction })
  }
  return builders.flatMap((builder) => {
    const orderedItems = [...builder.items].sort((left, right) =>
      builder.direction === "rtl"
        ? right.alongStart - left.alongStart || right.id.localeCompare(left.id)
        : left.alongStart - right.alongStart || left.id.localeCompare(right.id),
    )
    const ids = orderedItems.map((item) => item.id)
    const range = rangeForItems(source, pageId, ids)
    const bounds = boundsForItems(source, ids)
    if (!range || !bounds) return []
    return [
      {
        id: lineId(pageId, ids),
        pageId,
        sourceItemIds: ids,
        sourceRange: range,
        bounds,
        orientation: builder.orientation,
        direction: builder.direction,
        confidence: 0.96,
        reasons: ["page-space baseline and spacing agree"],
        crossCenter:
          builder.items.reduce((sum, item) => sum + item.crossCenter, 0) / builder.items.length,
      },
    ]
  })
}

export function columnBounds(lines: readonly ReadingLine[]): PageBounds | null {
  const first = lines[0]
  if (!first) return null
  const left = Math.min(...lines.map((line) => line.bounds.x))
  const top = Math.min(...lines.map((line) => line.bounds.y))
  const right = Math.max(...lines.map((line) => line.bounds.x + line.bounds.width))
  const bottom = Math.max(...lines.map((line) => line.bounds.y + line.bounds.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function makeBlocks(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  columnId: string,
  lines: readonly ReadingLine[],
): readonly ReadingBlock[] {
  const sorted = [...lines].sort(
    (left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x,
  )
  const columnAmbiguous = lines.some((left, index) =>
    lines.slice(index + 1).some((right) => overlaps(left.bounds, right.bounds)),
  )
  const groups: ReadingLine[][] = []
  for (const line of sorted) {
    const current = groups[groups.length - 1]
    const previous = current?.[current.length - 1]
    const gap = previous
      ? line.bounds.y - (previous.bounds.y + previous.bounds.height)
      : Number.POSITIVE_INFINITY
    const limit = previous
      ? Math.max(24, Math.max(previous.bounds.height, line.bounds.height) * 2.4)
      : 0
    if (current && previous && gap <= limit && !overlaps(previous.bounds, line.bounds))
      current.push(line)
    else groups.push([line])
  }
  return groups.flatMap((group) => {
    const lineIds = group.map((line) => line.id)
    const ids = group.flatMap((line) => line.sourceItemIds)
    const range = rangeForItems(source, pageId, ids)
    const bounds = boundsForItems(source, ids)
    if (!range || !bounds) return []
    const uncertain = columnAmbiguous || group.some((line) => line.confidence < 0.65)
    return [
      {
        id: blockId(pageId, lineIds),
        pageId,
        lineIds,
        sourceItemIds: ids,
        sourceRange: range,
        bounds,
        columnId,
        confidence: uncertain ? 0.45 : 0.94,
        reasons: uncertain
          ? ["one or more lines have overlapping geometry"]
          : ["vertical spacing is continuous within one column"],
      },
    ]
  })
}
