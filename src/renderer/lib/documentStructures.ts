import type { SourceDocumentAst } from "../../shared/documentAst"
import {
  type DocumentReadingOrder,
  deriveDocumentReadingOrder,
  type ReadingBlock,
} from "./documentReadingOrder"
import {
  type CaptionOwnership,
  type LocalSemanticEdge,
  type LocalSemanticNode,
  makeSemanticNode,
  type PageBounds,
  pageText,
  type SourceItemId,
  type SourcePageId,
} from "./documentSemanticTypes"

export type VisualRegionKind = "figure" | "table" | "chart" | "image" | "ocr_block"

export type LocalVisualRegion = {
  readonly id: string
  readonly pageId: SourcePageId
  readonly kind: VisualRegionKind
  readonly sourceItemIds: readonly SourceItemId[]
  readonly bounds: PageBounds
  readonly groupId?: string
}

export type DocumentStructureOptions = {
  readonly readingOrder?: DocumentReadingOrder
  readonly visualRegions?: readonly LocalVisualRegion[]
}

export type DocumentStructures = {
  readonly sourceHash: string
  readonly nodes: readonly LocalSemanticNode[]
  readonly edges: readonly LocalSemanticEdge[]
  readonly captionOwnership: readonly CaptionOwnership[]
}

const headingPattern =
  /^(?:(\d+(?:\.\d+)*\.?)\s+)?(abstract|introduction|related\s+work|methods?|methodology|framework|experiments?|results?|discussion|conclusion|references|bibliography)\b(?:\s+.*)?$/iu
const captionPattern = /^(figure|fig\.?|table|tab\.?|chart)\s*(\d+(?:\.\d+)*)\s*[:.|-]?\s*\S/iu
const equationPattern = /(?:=|≤|≥|≈|∑|∫|√|±|∆|\bE\s*\()/u
const footnotePattern = /^(?:\[?\d{1,3}\]?|[*†‡])\s+/u
const nakedNumericPattern = /^\s*\[\d+(?:\s*[,;-]\s*\d+)*\]\s*$/u

function headingLevel(text: string): number | null {
  const match = text.match(headingPattern)
  if (!match) return null
  return match[1]?.split(".").filter((part) => part.length > 0).length ?? 1
}

function captionKind(text: string): "figure" | "table" | "chart" | null {
  const match = text.match(captionPattern)
  if (!match?.[1]) return null
  const label = match[1].toLowerCase()
  if (label.startsWith("fig")) return "figure"
  if (label.startsWith("tab")) return "table"
  if (label.startsWith("chart")) return "chart"
  return null
}

function isBibliographyLine(text: string, page: string): boolean {
  return (
    /\b(?:references|bibliography)\b/iu.test(page) &&
    (/^\s*\[\d+\]\s+/u.test(text) ||
      /^[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)*\.\s+(?:19|20)\d{2}\b/u.test(text))
  )
}

function structureKind(
  text: string,
  block: ReadingBlock,
  pageHeight: number,
  pageSourceText: string,
): "heading" | "caption" | "equation" | "footnote" | "header" | "footer" | "paragraph" | null {
  if (nakedNumericPattern.test(text) || isBibliographyLine(text, pageSourceText)) return null
  if (captionKind(text)) return "caption"
  if (headingLevel(text) !== null) return "heading"
  if (equationPattern.test(text) && (text.includes("=") || text.length < 80)) return "equation"
  if (footnotePattern.test(text) && block.bounds.y > pageHeight * 0.78) return "footnote"
  if (block.bounds.y < pageHeight * 0.07) return "header"
  if (block.bounds.y + block.bounds.height > pageHeight * 0.93) return "footer"
  return "paragraph"
}

function visualCandidates(
  caption: LocalSemanticNode,
  kind: "figure" | "table" | "chart",
  regions: readonly LocalVisualRegion[],
  consumed: ReadonlySet<string>,
): readonly LocalVisualRegion[] {
  return regions
    .filter(
      (region) =>
        region.pageId === caption.pageId && region.kind === kind && !consumed.has(region.id),
    )
    .map((region) => ({
      region,
      distance: Math.min(
        Math.abs(caption.bounds.y - (region.bounds.y + region.bounds.height)),
        Math.abs(region.bounds.y - (caption.bounds.y + caption.bounds.height)),
      ),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.region.id.localeCompare(right.region.id),
    )
    .filter(
      ({ distance }, index, candidates) =>
        index === 0 || distance <= (candidates[0]?.distance ?? distance) + 24,
    )
    .map(({ region }) => region)
}

function ownershipForCaption(
  source: SourceDocumentAst,
  caption: LocalSemanticNode,
  kind: "figure" | "table" | "chart",
  regions: readonly LocalVisualRegion[],
  consumed: Set<string>,
): { readonly owner: LocalSemanticNode | null; readonly ownership: CaptionOwnership } {
  const candidates = visualCandidates(caption, kind, regions, consumed)
  const groupIds = [
    ...new Set(
      candidates.map((candidate) => candidate.groupId).filter((groupId) => groupId !== undefined),
    ),
  ]
  const explicitlyGrouped =
    candidates.length > 1 &&
    groupIds.length === 1 &&
    candidates.every((candidate) => candidate.groupId === groupIds[0])
  if (candidates.length !== 1 && !explicitlyGrouped) {
    return candidates.length === 0
      ? { owner: null, ownership: { status: "unowned", captionId: caption.id } }
      : {
          owner: null,
          ownership: {
            status: "ambiguous",
            captionId: caption.id,
            candidateIds: candidates.map((candidate) => candidate.id),
          },
        }
  }
  const firstCandidate = candidates[0]
  const candidate =
    explicitlyGrouped && firstCandidate
      ? {
          ...firstCandidate,
          id: groupIds[0] ?? firstCandidate.id,
          sourceItemIds: [...new Set(candidates.flatMap((item) => item.sourceItemIds))],
          bounds: {
            x: Math.min(...candidates.map((item) => item.bounds.x)),
            y: Math.min(...candidates.map((item) => item.bounds.y)),
            width:
              Math.max(...candidates.map((item) => item.bounds.x + item.bounds.width)) -
              Math.min(...candidates.map((item) => item.bounds.x)),
            height:
              Math.max(...candidates.map((item) => item.bounds.y + item.bounds.height)) -
              Math.min(...candidates.map((item) => item.bounds.y)),
          },
        }
      : firstCandidate
  if (!candidate) return { owner: null, ownership: { status: "unowned", captionId: caption.id } }
  const owner = makeSemanticNode(
    source,
    candidate.kind,
    candidate.pageId,
    candidate.sourceItemIds,
    0.86,
    ["visual ownership is supported by one local region"],
  )
  if (!owner) return { owner: null, ownership: { status: "unowned", captionId: caption.id } }
  for (const region of candidates) consumed.add(region.id)
  return { owner, ownership: { status: "owned", captionId: caption.id, ownerId: owner.id } }
}

export function deriveDocumentStructures(
  source: SourceDocumentAst,
  options: DocumentStructureOptions = {},
): DocumentStructures {
  const readingOrder = options.readingOrder ?? deriveDocumentReadingOrder(source)
  const regions = options.visualRegions ?? []
  const nodes: LocalSemanticNode[] = []
  const edges: LocalSemanticEdge[] = []
  const captionOwnership: CaptionOwnership[] = []
  const consumedRegions = new Set<string>()
  const headingStack: { readonly node: LocalSemanticNode; readonly level: number }[] = []

  for (const page of readingOrder.pages) {
    const sourcePage = source.pages.find((candidate) => candidate.id === page.pageId)
    const pageHeight = sourcePage?.height ?? 1
    const sourcePageText = pageText(source, page.pageId)
    for (const block of page.blocks) {
      const text = sourcePageText.slice(block.sourceRange.start, block.sourceRange.end).trim()
      const kind = structureKind(text, block, pageHeight, sourcePageText)
      if (!kind) continue
      const node = makeSemanticNode(
        source,
        kind,
        page.pageId,
        block.sourceItemIds,
        block.confidence,
        block.reasons,
      )
      if (!node) continue
      nodes.push(node)
      if (kind === "heading") {
        const level = headingLevel(text) ?? 1
        const parent = [...headingStack].reverse().find((candidate) => candidate.level < level)
        if (parent)
          edges.push({
            from: parent.node.id,
            to: node.id,
            kind: "parent",
            confidence: Math.min(parent.node.confidence, node.confidence),
            reasons: ["numeric heading depth establishes containment"],
          })
        while (
          headingStack.length > 0 &&
          (headingStack[headingStack.length - 1]?.level ?? 0) >= level
        )
          headingStack.pop()
        headingStack.push({ node, level })
      }
      const visualKind = kind === "caption" ? captionKind(text) : null
      if (visualKind) {
        const ownership = ownershipForCaption(source, node, visualKind, regions, consumedRegions)
        captionOwnership.push(ownership.ownership)
        if (ownership.owner) {
          nodes.push(ownership.owner)
          edges.push({
            from: node.id,
            to: ownership.owner.id,
            kind: "caption",
            confidence: ownership.owner.confidence,
            reasons: ["caption and visual region form one deterministic ownership pair"],
          })
        }
      }
    }
  }
  return { sourceHash: source.sourceHash, nodes, edges, captionOwnership }
}
