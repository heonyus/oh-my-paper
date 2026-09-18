import { z } from "zod"
import { sha256Schema } from "./schemas"

const astVersionSchema = z.literal("1.0.0")
const astIdSchema = z
  .string()
  .regex(/^(page|item|node):[a-zA-Z0-9._-]+$/)
  .brand("AstId")
const pageIdSchema = z
  .string()
  .regex(/^page:[a-zA-Z0-9._-]+$/)
  .brand("PageAstId")
const sourceItemIdSchema = z
  .string()
  .regex(/^item:[a-zA-Z0-9._-]+$/)
  .brand("SourceItemAstId")
const semanticNodeIdSchema = z
  .string()
  .regex(/^node:[a-zA-Z0-9._-]+$/)
  .brand("SemanticNodeAstId")

const boundsSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
})
const transformSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])

const pageSchema = z.object({
  id: pageIdSchema,
  page: z.number().int().positive(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
})

const sourceItemSchema = z.object({
  id: sourceItemIdSchema,
  pageId: pageIdSchema,
  text: z.string(),
  normalizedStart: z.number().int().nonnegative(),
  normalizedEnd: z.number().int().nonnegative(),
  bounds: boundsSchema,
})

const sourceRawItemSchema = z.object({
  id: sourceItemIdSchema,
  pageId: pageIdSchema,
  text: z.string(),
  rawStart: z.number().int().nonnegative(),
  rawEnd: z.number().int().nonnegative(),
  normalizedStart: z.number().int().nonnegative(),
  normalizedEnd: z.number().int().nonnegative(),
  transform: transformSchema,
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  hasEOL: z.boolean(),
  lineId: z.string().regex(/^line:[a-zA-Z0-9._-]+$/),
  blockId: z.string().regex(/^block:[a-zA-Z0-9._-]+$/),
  bounds: boundsSchema,
})

const sourceLineSchema = z.object({
  id: z.string().regex(/^line:[a-zA-Z0-9._-]+$/),
  pageId: pageIdSchema,
  sourceItemIds: z.array(sourceItemIdSchema).min(1),
  bounds: boundsSchema,
})

const sourceBlockSchema = z.object({
  id: z.string().regex(/^block:[a-zA-Z0-9._-]+$/),
  pageId: pageIdSchema,
  lineIds: z.array(z.string().regex(/^line:[a-zA-Z0-9._-]+$/)).min(1),
  sourceItemIds: z.array(sourceItemIdSchema).min(1),
  bounds: boundsSchema,
})

const sourceDocumentAstSchema = z
  .object({
    schemaVersion: astVersionSchema,
    sourceHash: sha256Schema,
    extractorVersion: z.string().min(1).max(64),
    pages: z.array(pageSchema).min(1),
    items: z.array(sourceItemSchema),
    rawItems: z.array(sourceRawItemSchema).default([]),
    lines: z.array(sourceLineSchema).default([]),
    blocks: z.array(sourceBlockSchema).default([]),
  })
  .superRefine((artifact, context) => {
    const pageIds = new Set<string>()
    for (const page of artifact.pages) {
      if (pageIds.has(page.id))
        context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate page ID" })
      pageIds.add(page.id)
    }
    const itemIds = new Set<string>()
    for (const item of artifact.items) {
      if (itemIds.has(item.id))
        context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate source item ID" })
      itemIds.add(item.id)
      const page = artifact.pages.find((candidate) => candidate.id === item.pageId)
      if (
        !page ||
        item.normalizedEnd <= item.normalizedStart ||
        item.bounds.x + item.bounds.width > page.width ||
        item.bounds.y + item.bounds.height > page.height
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid source item provenance" })
      }
    }
  })

const semanticKindSchema = z.enum([
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
])
const semanticNodeSchema = z.object({
  id: semanticNodeIdSchema,
  kind: semanticKindSchema,
  pageId: pageIdSchema,
  sourceItemIds: z.array(sourceItemIdSchema),
  confidence: z.number().min(0).max(1),
  origin: z.enum(["deterministic", "local_ocr"]),
})
const semanticEdgeSchema = z.object({
  from: semanticNodeIdSchema,
  to: semanticNodeIdSchema,
  kind: z.enum(["parent", "child", "order", "caption", "reference"]),
})
const semanticDocumentAstSchema = z.object({
  schemaVersion: astVersionSchema,
  sourceHash: sha256Schema,
  layoutVersion: z.string().min(1).max(64),
  nodes: z.array(semanticNodeSchema),
  edges: z.array(semanticEdgeSchema),
})

const enrichmentCandidateSchema = z.object({
  nodeId: semanticNodeIdSchema,
  kind: z.enum(["reading_order", "relationship", "translation", "assessment"]),
  confidence: z.number().min(0).max(1),
  origin: z.literal("ai"),
})
const aiDocumentEnrichmentSchema = z.object({
  schemaVersion: astVersionSchema,
  sourceHash: sha256Schema,
  candidates: z.array(enrichmentCandidateSchema),
})

export const documentAstBundleSchema = z
  .object({
    source: sourceDocumentAstSchema,
    semantic: semanticDocumentAstSchema,
    enrichment: aiDocumentEnrichmentSchema.nullable(),
  })
  .superRefine((bundle, context) => {
    if (
      bundle.source.sourceHash !== bundle.semantic.sourceHash ||
      bundle.enrichment?.sourceHash !== bundle.source.sourceHash
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AST layers must share a source hash",
      })
    }
    const sourceIds = new Set(bundle.source.items.map((item) => item.id))
    const nodeIds = new Set<string>()
    for (const node of bundle.semantic.nodes) {
      if (nodeIds.has(node.id) || !node.sourceItemIds.every((id) => sourceIds.has(id))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "invalid semantic node reference",
        })
      }
      nodeIds.add(node.id)
    }
    for (const edge of bundle.semantic.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid semantic edge" })
      }
    }
    for (const candidate of bundle.enrichment?.candidates ?? []) {
      if (!nodeIds.has(candidate.nodeId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI enrichment may only reference semantic nodes",
        })
    }
  })

export {
  aiDocumentEnrichmentSchema,
  pageIdSchema,
  semanticDocumentAstSchema,
  sourceDocumentAstSchema,
  sourceItemIdSchema,
}
export type DocumentAstBundle = z.infer<typeof documentAstBundleSchema>
export type SourceDocumentAst = z.infer<typeof sourceDocumentAstSchema>
export type SourceRawItem = z.infer<typeof sourceRawItemSchema>
export type SourceLine = z.infer<typeof sourceLineSchema>
export type SourceBlock = z.infer<typeof sourceBlockSchema>
export type SemanticDocumentAst = z.infer<typeof semanticDocumentAstSchema>
export type AiDocumentEnrichment = z.infer<typeof aiDocumentEnrichmentSchema>
export type AstId = z.infer<typeof astIdSchema>
