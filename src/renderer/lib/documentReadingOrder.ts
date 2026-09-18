import type { SourceDocumentAst } from "../../shared/documentAst"
import { columnBounds, makeBlocks, makeLines, overlaps } from "./documentReadingOrderGeometry"
import type {
  DocumentReadingOrder,
  ReadingBlock,
  ReadingColumn,
  ReadingLine,
  ReadingOrderPage,
  ReadingOrderRelation,
  SourceCharacterMapEntry,
} from "./documentReadingOrderTypes"
import { pageItems, rangeForItems, type SourcePageId } from "./documentSemanticTypes"

export type {
  DocumentReadingOrder,
  ReadingBlock,
  ReadingColumn,
  ReadingLine,
  ReadingOrderPage,
  ReadingOrderRelation,
  SourceCharacterMapEntry,
} from "./documentReadingOrderTypes"

function characterMap(source: SourceDocumentAst): readonly SourceCharacterMapEntry[] {
  return source.pages.flatMap((page) =>
    pageItems(source, page.id).flatMap((item) => {
      const range = rangeForItems(source, page.id, [item.id])
      if (!range) return []
      return new Array<string>(item.normalizedEnd - item.normalizedStart)
        .fill("")
        .flatMap((_, index) => [
          {
            pageId: page.id,
            normalizedOffset: item.normalizedStart + index,
            sourceItemId: item.id,
            sourceRange: {
              ...range,
              start: item.normalizedStart + index,
              end: item.normalizedStart + index + 1,
            },
          },
        ])
    }),
  )
}

function uniqueBlocks(blocks: readonly ReadingBlock[]): readonly ReadingBlock[] {
  return blocks.filter(
    (block, index, all) => all.findIndex((candidate) => candidate.id === block.id) === index,
  )
}

function columnGroups(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  pageWidth: number,
  lines: readonly ReadingLine[],
): readonly {
  readonly id: string
  readonly lines: readonly ReadingLine[]
  readonly blocks: readonly ReadingBlock[]
}[] {
  const regularLines = lines.filter((line) => line.bounds.width < pageWidth * 0.72)
  const regular = regularLines.length > 0 ? regularLines : lines
  const groups: ReadingLine[][] = []
  for (const line of [...regular].sort(
    (left, right) => left.bounds.x - right.bounds.x || left.bounds.y - right.bounds.y,
  )) {
    const center = line.bounds.x + line.bounds.width / 2
    const group = groups.find((candidate) => {
      const first = candidate[0]
      const candidateCenter = first ? first.bounds.x + first.bounds.width / 2 : center
      return (
        Math.abs(candidateCenter - center) <= Math.max(pageWidth * 0.12, line.bounds.width * 0.5)
      )
    })
    if (group) group.push(line)
    else groups.push([line])
  }
  return groups
    .sort((left, right) => {
      const direction = lines.some((line) => line.direction === "rtl") ? -1 : 1
      return direction * ((left[0]?.bounds.x ?? 0) - (right[0]?.bounds.x ?? 0))
    })
    .map((group, index) => {
      const id = `column:${pageId.replace(/^page:/u, "")}-${index}`
      return { id, lines: group, blocks: makeBlocks(source, pageId, id, group) }
    })
}

function spanningBlocks(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  lines: readonly ReadingLine[],
  pageWidth: number,
  firstRegularY: number,
  lastRegularY: number,
): readonly ReadingBlock[] {
  if (lines.every((line) => line.bounds.width >= pageWidth * 0.72)) return []
  const spanning = lines.filter((line) => line.bounds.width >= pageWidth * 0.72)
  return [
    ...makeBlocks(
      source,
      pageId,
      `column:${pageId}-spanning-before`,
      spanning.filter((line) => line.bounds.y < firstRegularY),
    ),
    ...makeBlocks(
      source,
      pageId,
      `column:${pageId}-spanning-after`,
      spanning.filter((line) => line.bounds.y >= lastRegularY),
    ),
  ]
}

function pageOrder(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  pageWidth: number,
): ReadingOrderPage {
  const lines = makeLines(source, pageId)
  const regular = lines.filter((line) => line.bounds.width < pageWidth * 0.72)
  const columnsWithBlocks = columnGroups(source, pageId, pageWidth, lines)
  const firstRegularY = regular.reduce(
    (minimum, line) => Math.min(minimum, line.bounds.y),
    Number.POSITIVE_INFINITY,
  )
  const lastRegularY = regular.reduce((maximum, line) => Math.max(maximum, line.bounds.y), 0)
  const blocks = uniqueBlocks([
    ...spanningBlocks(source, pageId, lines, pageWidth, firstRegularY, lastRegularY),
    ...columnsWithBlocks.flatMap((column) => column.blocks),
  ])
  const orderedLineIds = blocks.flatMap((block) => block.lineIds)
  const orderedSourceItemIds = blocks.flatMap((block) => block.sourceItemIds)
  const columns: readonly ReadingColumn[] = columnsWithBlocks.flatMap((column) => {
    const bounds = columnBounds(column.lines)
    if (!bounds) return []
    const ambiguous = column.lines.some((left, index) =>
      column.lines.slice(index + 1).some((right) => overlaps(left.bounds, right.bounds)),
    )
    return [
      {
        id: column.id,
        pageId,
        lineIds: column.lines.map((line) => line.id),
        blockIds: column.blocks.map((block) => block.id),
        bounds,
        confidence: ambiguous ? 0.45 : 0.94,
        reasons: ambiguous
          ? ["column lines overlap in page space"]
          : ["stable left-edge clustering"],
      },
    ]
  })
  const relations: readonly ReadingOrderRelation[] = blocks.slice(1).map((block, index) => {
    const previous = blocks[index]
    const uncertain = block.confidence < 0.65 || (previous?.confidence ?? 0.94) < 0.65
    return {
      from: previous?.id ?? block.id,
      to: block.id,
      kind: uncertain ? "uncertain" : "before",
      confidence: uncertain ? 0.45 : Math.min(previous?.confidence ?? 0.94, block.confidence),
      reasons: uncertain
        ? ["geometry does not establish a unique reading relation"]
        : ["column and within-column order agree"],
    }
  })
  return {
    pageId,
    columns,
    lines,
    blocks,
    orderedLineIds,
    orderedBlockIds: blocks.map((block) => block.id),
    orderedSourceItemIds,
    relations,
  }
}

export function deriveDocumentReadingOrder(source: SourceDocumentAst): DocumentReadingOrder {
  const pages = source.pages.map((page) => pageOrder(source, page.id, page.width))
  return { sourceHash: source.sourceHash, pages, characterMap: characterMap(source) }
}
