import { z } from "zod"
import { knowledgeEndpointSchema } from "./fragmentAnchors"
import {
  boardIdSchema,
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
  evidenceAnchorSchema,
  knowledgeNodeIdSchema,
  knowledgeNodeKindSchema,
  knowledgeNodeSchema,
  knowledgeRelationIdSchema,
  knowledgeRelationSchema,
  placementIdSchema,
  relationPredicateSchema,
  relationProvenanceSchema,
  relationReviewStateSchema,
} from "./knowledgeSchemas"
import { cardIdSchema, documentIdSchema, sha256Schema } from "./schemas"

export const nodeFilterSchema = z.object({
  kind: knowledgeNodeKindSchema.optional(),
  search: z.string().max(500).optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
})

export const neighbourGraphOptionsSchema = z.object({
  maxNodes: z.number().int().positive().max(200).optional(),
  maxEdges: z.number().int().positive().max(400).optional(),
})

export const relationFilterSchema = z.object({
  nodeId: knowledgeNodeIdSchema.optional(),
  predicate: relationPredicateSchema.optional(),
  reviewState: relationReviewStateSchema.optional(),
})

export const backlinkItemSchema = z.object({
  relation: knowledgeRelationSchema,
  sourceNode: knowledgeNodeSchema,
  evidenceAnchors: z.array(evidenceAnchorSchema),
})

export const nodeNeighbourGraphSchema = z.object({
  rootNode: knowledgeNodeSchema,
  depth: z.number().int().nonnegative(),
  nodes: z.array(knowledgeNodeSchema),
  relations: z.array(knowledgeRelationSchema),
  evidenceAnchors: z.array(evidenceAnchorSchema),
  truncated: z.boolean().optional(),
})

export const createNodeInputSchema = z.object({
  id: knowledgeNodeIdSchema.optional(),
  kind: knowledgeNodeKindSchema,
  title: z.string().min(1).max(2_000),
  body: z.string().default("").optional(),
  aliases: z.array(z.string().min(1).max(500)).default([]).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export const updateNodeInputSchema = z.object({
  id: knowledgeNodeIdSchema,
  expectedBody: z.string().max(5_000_000).optional(),
  title: z.string().min(1).max(2_000).optional(),
  body: z.string().optional(),
  aliases: z.array(z.string().min(1).max(500)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const createRelationInputSchema = z.object({
  id: knowledgeRelationIdSchema.optional(),
  sourceId: knowledgeNodeIdSchema,
  targetId: knowledgeNodeIdSchema,
  sourceEndpoint: knowledgeEndpointSchema.optional(),
  targetEndpoint: knowledgeEndpointSchema.optional(),
  predicate: relationPredicateSchema,
  provenance: relationProvenanceSchema,
  evidenceIds: z.array(evidenceAnchorIdSchema).default([]).optional(),
  reviewState: relationReviewStateSchema.default("proposed").optional(),
})

export const updateRelationInputSchema = z.object({
  id: knowledgeRelationIdSchema,
  predicate: relationPredicateSchema.optional(),
  reviewState: relationReviewStateSchema.optional(),
  evidenceIds: z.array(evidenceAnchorIdSchema).optional(),
  sourceEndpoint: knowledgeEndpointSchema.optional(),
  targetEndpoint: knowledgeEndpointSchema.optional(),
})

export const createEvidenceAnchorInputSchema = z.object({
  id: evidenceAnchorIdSchema.optional(),
  documentVersionId: documentVersionIdSchema,
  page: z.number().int().positive(),
  quote: z.string().min(1).max(8_000),
  x: z.number().finite().default(0).optional(),
  y: z.number().finite().default(0).optional(),
  fragments: z
    .array(
      z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite(),
        height: z.number().finite(),
      }),
    )
    .default([])
    .optional(),
  astRanges: z
    .array(
      z.object({
        sourceItemId: z.string(),
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
      }),
    )
    .optional(),
})

export const evidenceNavigationTargetSchema = z.object({
  anchorId: evidenceAnchorIdSchema,
  documentVersionId: documentVersionIdSchema,
  originalDocumentId: documentIdSchema,
  hash: sha256Schema,
  page: z.number().int().positive(),
  quote: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  fragments: z.array(
    z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite(),
      height: z.number().finite(),
    }),
  ),
})

export const createBoardInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().default("").optional(),
})

export const createPlacementInputSchema = z.object({
  id: placementIdSchema.optional(),
  boardId: boardIdSchema,
  nodeId: knowledgeNodeIdSchema,
  cardId: cardIdSchema.nullable().optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().min(100).max(2_000).default(300).optional(),
  height: z.number().min(80).max(3_000).nullable().optional(),
  minimized: z.boolean().default(false).optional(),
  zIndex: z.number().int().default(0).optional(),
})

export const updatePlacementInputSchema = z.object({
  id: placementIdSchema,
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().min(100).max(2_000).optional(),
  height: z.number().min(80).max(3_000).nullable().optional(),
  minimized: z.boolean().optional(),
  zIndex: z.number().int().optional(),
})
