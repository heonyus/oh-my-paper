import { z } from "zod"
import type { SourceDocumentAst } from "../../shared/documentAst"
import { pageIdSchema } from "../../shared/documentAst"
import type { LocalEnrichmentResult } from "../../shared/documentLocalEnrichment"
import type {
  LocalSemanticEdge,
  LocalSemanticNode,
  PageBounds,
  SourceRange,
} from "./documentSemanticTypes"

export type SemanticNodeKind =
  | "heading"
  | "paragraph"
  | "table"
  | "figure"
  | "chart"
  | "equation"
  | "caption"
  | "citation_occurrence"
  | "citation_reference"
  | "image"
  | "footnote"
  | "header"
  | "footer"
  | "ocr_block"
  | "unknown"

const semanticNodeKinds = [
  "heading",
  "paragraph",
  "table",
  "figure",
  "chart",
  "equation",
  "caption",
  "citation_occurrence",
  "citation_reference",
  "image",
  "footnote",
  "header",
  "footer",
  "ocr_block",
  "unknown",
] satisfies readonly [SemanticNodeKind, ...SemanticNodeKind[]]
export const semanticOriginSchema = z.enum(["deterministic", "local_layout", "local_ocr"])
export type SemanticOrigin = z.infer<typeof semanticOriginSchema>

const semanticBoundsSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
})
const semanticRangeSchema = z.object({
  pageId: pageIdSchema,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  sourceItemIds: z.array(z.string()).min(1).readonly(),
})

export const semanticNodeIdSchema = z
  .string()
  .regex(/^node:[a-zA-Z0-9._-]+$/u)
  .brand("SemanticDocumentNodeId")

const semanticNodeSchema = z.object({
  id: semanticNodeIdSchema,
  kind: z.enum(semanticNodeKinds),
  pageId: pageIdSchema,
  sourceItemIds: z.array(z.string()).readonly(),
  sourceRange: semanticRangeSchema.optional(),
  text: z.string(),
  bounds: semanticBoundsSchema,
  confidence: z.number().min(0).max(1),
  origin: semanticOriginSchema,
  reasons: z.array(z.string()).readonly(),
})

const semanticEdgeSchema = z.object({
  from: semanticNodeIdSchema,
  to: semanticNodeIdSchema,
  kind: z.enum(["parent", "child", "order", "caption", "reference"]),
  confidence: z.number().min(0).max(1),
  origin: semanticOriginSchema,
  reasons: z.array(z.string()).readonly(),
})

export const semanticDocumentAstSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  layoutVersion: z.string().min(1).max(64),
  status: z.enum(["ready", "degraded"]),
  degradedReasons: z
    .array(
      z.enum([
        "layout_unavailable",
        "layout_region_unresolved",
        "local_enrichment_unavailable",
        "enrichment_region_unresolved",
      ]),
    )
    .readonly(),
  nodes: z.array(semanticNodeSchema).readonly(),
  edges: z.array(semanticEdgeSchema).readonly(),
})

export type SemanticDocumentAst = z.infer<typeof semanticDocumentAstSchema>
export type SemanticNodeId = SemanticDocumentAst["nodes"][number]["id"]
export type SemanticStructureInput = {
  readonly sourceHash: string
  readonly nodes: readonly LocalSemanticNode[]
  readonly edges: readonly (Omit<LocalSemanticEdge, "from" | "to"> & {
    readonly from: string
    readonly to: string
  })[]
  readonly captionOwnership: readonly import("./documentSemanticTypes").CaptionOwnership[]
}
export type SemanticCompositionInput = {
  readonly source: SourceDocumentAst
  readonly readingOrder?: import("./documentReadingOrder").DocumentReadingOrder
  readonly structures?: SemanticStructureInput
  readonly citations?: import("./documentCitations").DocumentCitations
  readonly layout?: import("../../shared/documentLayout").DocumentLayout
  readonly localEnrichment?: LocalEnrichmentResult
}
export type SemanticCompositionResult = {
  readonly status: SemanticDocumentAst["status"]
  readonly ast: SemanticDocumentAst
}

export class SemanticDocumentAstCompositionError extends Error {
  readonly name = "SemanticDocumentAstCompositionError"

  constructor(
    readonly kind:
      | "source_hash_mismatch"
      | "missing_source_reference"
      | "invalid_source_range"
      | "duplicate_node"
      | "dangling_relation"
      | "reused_relation",
    readonly reference: string,
  ) {
    super(`${kind}:${reference}`)
  }
}

export type SemanticNodeRecord = {
  readonly id: string
  readonly kind: SemanticNodeKind
  readonly pageId: string
  readonly sourceItemIds: readonly string[]
  readonly text: string
  readonly bounds: PageBounds
  readonly confidence: number
  readonly origin: SemanticOrigin
  readonly reasons: readonly string[]
  readonly sourceRange?: SourceRange
}

export type SemanticEdgeRecord = {
  readonly from: string
  readonly to: string
  readonly kind: "parent" | "child" | "order" | "caption" | "reference"
  readonly confidence: number
  readonly origin: SemanticOrigin
  readonly reasons: readonly string[]
}

export type LocalRecord = Extract<
  LocalEnrichmentResult,
  { readonly status: "ready" }
>["records"][number]
