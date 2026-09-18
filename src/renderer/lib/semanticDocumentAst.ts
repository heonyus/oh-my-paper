import { deriveDocumentCitations } from "./documentCitations"
import type { DocumentReadingOrder } from "./documentReadingOrder"
import { deriveDocumentReadingOrder } from "./documentReadingOrder"
import { pageText } from "./documentSemanticTypes"
import { deriveDocumentStructures } from "./documentStructures"
import {
  deriveEnrichmentNodes,
  deriveLayoutRegions,
  nodeFromLocal,
  sourceRangeFor,
} from "./semanticDocumentAstDerivation"
import {
  type SemanticCompositionInput,
  type SemanticCompositionResult,
  type SemanticDocumentAst,
  SemanticDocumentAstCompositionError,
  type SemanticEdgeRecord,
  type SemanticNodeRecord,
  semanticDocumentAstSchema,
} from "./semanticDocumentAstTypes"

export type {
  SemanticCompositionInput,
  SemanticCompositionResult,
  SemanticDocumentAst,
  SemanticNodeId,
} from "./semanticDocumentAstTypes"
export {
  SemanticDocumentAstCompositionError,
  semanticDocumentAstSchema,
  semanticNodeIdSchema,
} from "./semanticDocumentAstTypes"

function assertSourceHash(sourceHash: string, otherHash: string): void {
  if (sourceHash !== otherHash)
    throw new SemanticDocumentAstCompositionError("source_hash_mismatch", otherHash)
}

function addNode(nodes: Map<string, SemanticNodeRecord>, node: SemanticNodeRecord): void {
  const current = nodes.get(node.id)
  if (current && JSON.stringify(current) !== JSON.stringify(node))
    throw new SemanticDocumentAstCompositionError("duplicate_node", node.id)
  nodes.set(node.id, node)
}

function addEdge(
  edges: Map<string, SemanticEdgeRecord>,
  nodes: ReadonlyMap<string, SemanticNodeRecord>,
  edge: SemanticEdgeRecord,
): void {
  if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to)
    throw new SemanticDocumentAstCompositionError("dangling_relation", `${edge.from}->${edge.to}`)
  const key = `${edge.from}|${edge.to}|${edge.kind}`
  if (edges.has(key)) throw new SemanticDocumentAstCompositionError("reused_relation", key)
  edges.set(key, edge)
}

function ensureInputHashes(input: SemanticCompositionInput, order: DocumentReadingOrder): void {
  assertSourceHash(input.source.sourceHash, order.sourceHash)
  if (input.structures) assertSourceHash(input.source.sourceHash, input.structures.sourceHash)
  if (input.citations) assertSourceHash(input.source.sourceHash, input.citations.sourceHash)
  if (input.layout) assertSourceHash(input.source.sourceHash, input.layout.sourceHash)
  if (input.localEnrichment)
    assertSourceHash(input.source.sourceHash, input.localEnrichment.sourceHash)
}

export function composeSemanticDocumentAst(
  input: SemanticCompositionInput,
): SemanticCompositionResult {
  const readingOrder = input.readingOrder ?? deriveDocumentReadingOrder(input.source)
  ensureInputHashes(input, readingOrder)
  const degraded = new Set<SemanticDocumentAst["degradedReasons"][number]>()
  const layoutResult = input.layout
    ? deriveLayoutRegions(input.source, input.layout, degraded)
    : { regions: [], nodes: [] }
  if (!input.layout) degraded.add("layout_unavailable")
  const structures =
    input.structures ??
    deriveDocumentStructures(input.source, { readingOrder, visualRegions: layoutResult.regions })
  const citations = input.citations ?? deriveDocumentCitations(input.source)
  const nodes = new Map<string, SemanticNodeRecord>()
  const edges = new Map<string, SemanticEdgeRecord>()
  const blockNodeIds = new Map<string, string>()
  for (const page of readingOrder.pages) {
    for (const block of page.blocks) {
      const sourceRange = sourceRangeFor(
        input.source,
        block.pageId,
        block.sourceItemIds,
        block.sourceRange,
      )
      const node: SemanticNodeRecord = {
        id: `node:paragraph-${block.id.replaceAll(":", "-")}`,
        kind: "paragraph",
        pageId: block.pageId,
        sourceItemIds: sourceRange.sourceItemIds,
        sourceRange,
        text: pageText(input.source, block.pageId).slice(sourceRange.start, sourceRange.end).trim(),
        bounds: block.bounds,
        confidence: block.confidence,
        origin: "deterministic",
        reasons: block.reasons,
      }
      addNode(nodes, node)
      blockNodeIds.set(block.id, node.id)
    }
  }
  for (const node of structures.nodes) addNode(nodes, nodeFromLocal(input.source, node))
  for (const node of citations.nodes) addNode(nodes, nodeFromLocal(input.source, node))
  for (const node of layoutResult.nodes) addNode(nodes, node)
  if (input.localEnrichment?.status === "ready")
    for (const node of deriveEnrichmentNodes(input.source, input.localEnrichment, degraded))
      addNode(nodes, node)
  if (input.localEnrichment?.status === "unavailable") degraded.add("local_enrichment_unavailable")
  for (const page of readingOrder.pages) {
    for (const relation of page.relations) {
      const from = blockNodeIds.get(relation.from)
      const to = blockNodeIds.get(relation.to)
      if (!from || !to)
        throw new SemanticDocumentAstCompositionError(
          "dangling_relation",
          `${relation.from}->${relation.to}`,
        )
      addEdge(edges, nodes, {
        from,
        to,
        kind: relation.kind === "before" ? "order" : "order",
        confidence: relation.confidence,
        origin: "deterministic",
        reasons: relation.reasons,
      })
    }
  }
  for (const edge of [...structures.edges, ...citations.edges])
    addEdge(edges, nodes, {
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      confidence: edge.confidence,
      origin: "deterministic",
      reasons: edge.reasons,
    })
  const ast = semanticDocumentAstSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash: input.source.sourceHash,
    layoutVersion: input.layout ? `${input.layout.model}-v${input.layout.version}` : "unavailable",
    status: degraded.size > 0 ? "degraded" : "ready",
    degradedReasons: [...degraded],
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  })
  return { status: ast.status, ast }
}
