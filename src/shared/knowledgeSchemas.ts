import { z } from "zod"
import { knowledgeEndpointSchema } from "./fragmentAnchors"
import {
  boardIdSchema,
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
  externalMappingIdSchema,
  knowledgeNodeIdSchema,
  knowledgeRelationIdSchema,
  placementIdSchema,
} from "./knowledgeIds"
import { cardIdSchema, documentIdSchema, sha256Schema, sourceAnchorSchema } from "./schemas"

export {
  boardIdSchema,
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
  externalMappingIdSchema,
  knowledgeNodeIdSchema,
  knowledgeRelationIdSchema,
  placementIdSchema,
} from "./knowledgeIds"

export const knowledgeNodeKindSchema = z.enum([
  "paper",
  "concept",
  "note",
  "claim",
  "evidence",
  "question",
  "hypothesis",
  "experiment",
  "project",
])

export const relationPredicateSchema = z.enum([
  "cites",
  "discusses",
  "interprets",
  "supported_by",
  "motivates",
  "tests",
  "refutes",
  "relates_to",
])

export const relationProvenanceSourceSchema = z.enum(["user", "import", "ai"])

export const relationProvenanceSchema = z.object({
  source: relationProvenanceSourceSchema,
  model: z.string().max(256).nullable().default(null),
  extractorVersion: z.string().max(128).nullable().default(null),
})

export const relationReviewStateSchema = z.enum([
  "proposed",
  "accepted",
  "rejected",
  "needs_review",
])

export const evidenceAnchorSchema = z.object({
  id: evidenceAnchorIdSchema,
  documentVersionId: documentVersionIdSchema,
  page: z.number().int().positive(),
  quote: z.string().min(1).max(8_000),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  fragments: sourceAnchorSchema.shape.fragments.default([]),
  astRanges: sourceAnchorSchema.shape.astRanges.optional(),
  createdAt: z.string().datetime(),
})

export const knowledgeNodeSchema = z.object({
  id: knowledgeNodeIdSchema,
  kind: knowledgeNodeKindSchema,
  title: z.string().min(1).max(2_000),
  body: z.string().default(""),
  aliases: z.array(z.string().min(1).max(500)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const knowledgeRelationSchema = z.object({
  id: knowledgeRelationIdSchema,
  sourceId: knowledgeNodeIdSchema,
  targetId: knowledgeNodeIdSchema,
  sourceEndpoint: knowledgeEndpointSchema.optional(),
  targetEndpoint: knowledgeEndpointSchema.optional(),
  predicate: relationPredicateSchema,
  provenance: relationProvenanceSchema,
  evidenceIds: z.array(evidenceAnchorIdSchema).max(128).default([]),
  reviewState: relationReviewStateSchema.default("proposed"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const documentVersionRecordSchema = z.object({
  id: documentVersionIdSchema,
  originalDocumentId: documentIdSchema,
  paperNodeId: knowledgeNodeIdSchema,
  hash: sha256Schema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
})

export const boardRecordSchema = z.object({
  id: boardIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().default(""),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const placementRecordSchema = z.object({
  id: placementIdSchema,
  boardId: boardIdSchema,
  nodeId: knowledgeNodeIdSchema,
  cardId: cardIdSchema.nullable().default(null),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().min(100).max(2_000).default(300),
  height: z.number().min(80).max(3_000).nullable().default(null),
  minimized: z.boolean().default(false),
  zIndex: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const externalMappingSchema = z.object({
  id: externalMappingIdSchema,
  nodeId: knowledgeNodeIdSchema,
  system: z.string().min(1).max(128),
  externalId: z.string().min(1).max(512),
  isFullTextReviewed: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
})

export type KnowledgeNodeId = z.infer<typeof knowledgeNodeIdSchema>
export type KnowledgeRelationId = z.infer<typeof knowledgeRelationIdSchema>
export type EvidenceAnchorId = z.infer<typeof evidenceAnchorIdSchema>
export type DocumentVersionId = z.infer<typeof documentVersionIdSchema>
export type BoardId = z.infer<typeof boardIdSchema>
export type PlacementId = z.infer<typeof placementIdSchema>
export type ExternalMappingId = z.infer<typeof externalMappingIdSchema>
export type KnowledgeNodeKind = z.infer<typeof knowledgeNodeKindSchema>
export type RelationPredicate = z.infer<typeof relationPredicateSchema>
export type RelationProvenanceSource = z.infer<typeof relationProvenanceSourceSchema>
export type RelationProvenance = z.infer<typeof relationProvenanceSchema>
export type RelationReviewState = z.infer<typeof relationReviewStateSchema>
export type EvidenceAnchor = z.infer<typeof evidenceAnchorSchema>
export type KnowledgeNode = z.infer<typeof knowledgeNodeSchema>
export type KnowledgeRelation = z.infer<typeof knowledgeRelationSchema>
export type DocumentVersionRecord = z.infer<typeof documentVersionRecordSchema>
export type BoardRecord = z.infer<typeof boardRecordSchema>
export type PlacementRecord = z.infer<typeof placementRecordSchema>
export type ExternalMapping = z.infer<typeof externalMappingSchema>
