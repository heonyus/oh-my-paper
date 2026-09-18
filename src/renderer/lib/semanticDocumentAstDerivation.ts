import { pageIdSchema, type SourceDocumentAst } from "../../shared/documentAst"
import type { DocumentLayout, DocumentLayoutBox } from "../../shared/documentLayout"
import type { LocalEnrichmentResult } from "../../shared/documentLocalEnrichment"
import type {
  LocalSemanticNode,
  PageBounds,
  SourceItemId,
  SourcePageId,
  SourceRange,
} from "./documentSemanticTypes"
import { pageItems, rangeForItems } from "./documentSemanticTypes"
import type { LocalVisualRegion } from "./documentStructures"
import type {
  LocalRecord,
  SemanticDocumentAst,
  SemanticNodeKind,
  SemanticNodeRecord,
} from "./semanticDocumentAstTypes"
import { SemanticDocumentAstCompositionError } from "./semanticDocumentAstTypes"

const layoutNodeKinds: Record<DocumentLayoutBox["label"], SemanticNodeKind | null> = {
  table: "table",
  chart: "chart",
  image: "image",
  paragraph_title: "heading",
  doc_title: "heading",
  figure_title: "caption",
  text: "paragraph",
  equation: "equation",
  code: "paragraph",
  list: "paragraph",
  header: "header",
  footer: "footer",
  page_number: "footer",
  aside_text: "unknown",
  page_footnote: "footnote",
}

function sourcePage(source: SourceDocumentAst, pageId: SourcePageId) {
  const page = source.pages.find((candidate) => candidate.id === pageId)
  if (!page) throw new SemanticDocumentAstCompositionError("missing_source_reference", pageId)
  return page
}

export function sourceRangeFor(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  sourceItemIds: readonly SourceItemId[],
  expected?: SourceRange,
): SourceRange {
  const range = rangeForItems(source, pageId, sourceItemIds)
  if (!range || range.sourceItemIds.length !== sourceItemIds.length)
    throw new SemanticDocumentAstCompositionError(
      "missing_source_reference",
      sourceItemIds.join(","),
    )
  if (
    expected &&
    (expected.pageId !== range.pageId ||
      expected.start !== range.start ||
      expected.end !== range.end ||
      expected.sourceItemIds.join("|") !== range.sourceItemIds.join("|"))
  )
    throw new SemanticDocumentAstCompositionError("invalid_source_range", range.pageId)
  return range
}

export function nodeFromLocal(
  source: SourceDocumentAst,
  node: LocalSemanticNode,
): SemanticNodeRecord {
  const sourceRange = sourceRangeFor(source, node.pageId, node.sourceItemIds, node.sourceRange)
  return {
    id: node.id,
    kind: node.kind,
    pageId: node.pageId,
    sourceItemIds: sourceRange.sourceItemIds,
    sourceRange,
    text: node.text,
    bounds: node.bounds,
    confidence: node.confidence,
    origin: "deterministic",
    reasons: node.reasons,
  }
}

function intersects(left: PageBounds, right: PageBounds): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  )
}

function sourceIdsForBounds(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  bounds: PageBounds,
): readonly SourceItemId[] {
  return pageItems(source, pageId)
    .filter((item) => intersects(item.bounds, bounds))
    .map((item) => item.id)
}

function pageBoundsForLayout(
  source: SourceDocumentAst,
  pageId: SourcePageId,
  page: { readonly width: number; readonly height: number },
  box: DocumentLayoutBox,
): PageBounds {
  const target = sourcePage(source, pageId)
  return {
    x: (box.x * target.width) / page.width,
    y: (box.y * target.height) / page.height,
    width: (box.width * target.width) / page.width,
    height: (box.height * target.height) / page.height,
  }
}

export function deriveLayoutRegions(
  source: SourceDocumentAst,
  layout: DocumentLayout,
  degraded: Set<SemanticDocumentAst["degradedReasons"][number]>,
): {
  readonly regions: readonly LocalVisualRegion[]
  readonly nodes: readonly SemanticNodeRecord[]
} {
  const regions: LocalVisualRegion[] = []
  const nodes: SemanticNodeRecord[] = []
  for (const page of layout.pages) {
    const pageIdResult = pageIdSchema.safeParse(`page:${page.pageNumber}`)
    if (
      !pageIdResult.success ||
      !source.pages.some((candidate) => candidate.id === pageIdResult.data)
    ) {
      degraded.add("layout_region_unresolved")
      continue
    }
    const pageId = pageIdResult.data
    for (const [index, box] of page.boxes.entries()) {
      const bounds = pageBoundsForLayout(source, pageId, page, box)
      const sourceItemIds = sourceIdsForBounds(source, pageId, bounds)
      const kind = layoutNodeKinds[box.label]
      if (!kind || sourceItemIds.length === 0) {
        degraded.add("layout_region_unresolved")
        continue
      }
      const sourceRange = sourceRangeFor(source, pageId, sourceItemIds)
      const node: SemanticNodeRecord = {
        id: `node:layout-${page.pageNumber}-${index}`,
        kind,
        pageId,
        sourceItemIds,
        sourceRange,
        text: `${box.label} region`,
        bounds,
        confidence: box.score,
        origin: "local_layout",
        reasons: ["PP-DocLayout_plus-L box intersects source text"],
      }
      nodes.push(node)
      if (kind === "figure" || kind === "table" || kind === "chart")
        regions.push({
          id: `layout:${page.pageNumber}:${index}`,
          pageId,
          kind,
          sourceItemIds,
          bounds,
        })
    }
  }
  return { regions, nodes }
}

function enrichmentKind(record: LocalRecord): SemanticNodeKind {
  switch (record.targetKind) {
    case "table":
      return "table"
    case "formula":
      return "equation"
    case "chart":
      return "chart"
    case "scanned":
    case "low_text":
    case "low_confidence":
      return "ocr_block"
  }
}

function enrichmentOrigin(record: LocalRecord): "local_layout" | "local_ocr" {
  return record.kind === "ocr" ? "local_ocr" : "local_layout"
}

export function deriveEnrichmentNodes(
  source: SourceDocumentAst,
  result: Extract<LocalEnrichmentResult, { readonly status: "ready" }>,
  degraded: Set<SemanticDocumentAst["degradedReasons"][number]>,
): readonly SemanticNodeRecord[] {
  return result.records.flatMap((record) => {
    const pageIdResult = pageIdSchema.safeParse(`page:${record.pageNumber}`)
    if (!pageIdResult.success || !source.pages.some((page) => page.id === pageIdResult.data)) {
      degraded.add("enrichment_region_unresolved")
      return []
    }
    const pageId = pageIdResult.data
    const sourceItemIds = sourceIdsForBounds(source, pageId, record.bounds)
    const sourceRange =
      sourceItemIds.length > 0 ? sourceRangeFor(source, pageId, sourceItemIds) : null
    const base = {
      id: `node:${record.id.replaceAll(":", "-")}`,
      kind: enrichmentKind(record),
      pageId,
      sourceItemIds,
      text: record.text ?? "",
      bounds: record.bounds,
      confidence: record.confidence,
      origin: enrichmentOrigin(record),
      reasons: ["PP-StructureV3 local enrichment record"],
    }
    return sourceRange ? [{ ...base, sourceRange }] : [base]
  })
}
