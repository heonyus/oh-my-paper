import { z } from "zod"
import {
  documentVersionRecordSchema,
  evidenceAnchorSchema,
  knowledgeNodeKindSchema,
  knowledgeRelationSchema,
  placementRecordSchema,
} from "./knowledgeSchemas"

export const interchangeVersionSchema = z.literal("1.0")

export const markdownRelationItemSchema = z.object({
  id: z.string().uuid().brand("KnowledgeRelationId").optional(),
  sourceId: z.string().uuid().brand("KnowledgeNodeId").optional(),
  targetId: z.string().uuid().brand("KnowledgeNodeId"),
  direction: z.enum(["outgoing", "incoming"]).default("outgoing"),
  evidenceIds: z.array(z.string().uuid().brand("EvidenceAnchorId")).default([]),
  predicate: knowledgeRelationSchema.shape.predicate,
  reviewState: knowledgeRelationSchema.shape.reviewState,
  provenance: knowledgeRelationSchema.shape.provenance,
})

export const markdownFrontMatterSchema = z.object({
  format: z.literal("scourgify-node-v1"),
  version: interchangeVersionSchema,
  id: z.string().uuid().brand("KnowledgeNodeId"),
  kind: knowledgeNodeKindSchema,
  title: z.string().min(1).max(2_000),
  aliases: z.array(z.string().min(1).max(500)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  evidenceAnchors: z.array(evidenceAnchorSchema).default([]),
  documentVersions: z.array(documentVersionRecordSchema).default([]),
  outgoingRelations: z.array(markdownRelationItemSchema).default([]),
})

export const markdownOutgoingRelationSchema = markdownRelationItemSchema

export type MarkdownFrontMatter = z.infer<typeof markdownFrontMatterSchema>
export type MarkdownOutgoingRelation = z.infer<typeof markdownOutgoingRelationSchema>
export type MarkdownRelationItem = MarkdownOutgoingRelation

export const canvasNodeSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("text"),
  text: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
  color: z.string().optional(),
})

export const canvasEdgeSchema = z.object({
  id: z.string().min(1).max(128),
  fromNode: z.string().min(1).max(128),
  toNode: z.string().min(1).max(128),
  label: z.string().optional(),
  fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
})

export const jsonCanvasV1Schema = z.object({
  nodes: z.array(canvasNodeSchema).default([]),
  edges: z.array(canvasEdgeSchema).default([]),
})

export type JsonCanvasV1 = z.infer<typeof jsonCanvasV1Schema>
export type CanvasNode = z.infer<typeof canvasNodeSchema>
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>

export const canvasSidecarNodeSchema = z.object({
  nodeId: z.string().uuid().brand("KnowledgeNodeId"),
  placement: placementRecordSchema,
  kind: knowledgeNodeKindSchema,
  title: z.string().min(1).max(2_000),
  aliases: z.array(z.string()).default([]),
  evidenceAnchors: z.array(evidenceAnchorSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const canvasSidecarMetadataSchema = z.object({
  format: z.literal("scourgify-canvas-sidecar-v1"),
  version: interchangeVersionSchema,
  boardId: z.string().uuid().brand("BoardId"),
  exportedAt: z.string().datetime(),
  nodes: z.array(canvasSidecarNodeSchema).default([]),
  relations: z.array(knowledgeRelationSchema).default([]),
})

export type CanvasSidecarNode = z.infer<typeof canvasSidecarNodeSchema>
export type CanvasSidecarMetadata = z.infer<typeof canvasSidecarMetadataSchema>

export const experimentStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
])

export const aggregateConfigValueSchema = z.union([
  z.string().max(256),
  z.number().finite(),
  z.boolean(),
])

export const experimentRecordV1Schema = z.object({
  format: z.literal("scourgify-experiment-v1"),
  runId: z.string().min(1).max(256),
  title: z.string().min(1).max(500),
  status: experimentStatusSchema,
  task: z.string().min(1).max(256),
  model: z.string().min(1).max(256),
  codeCommit: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/)
    .nullable()
    .default(null),
  aggregateConfig: z.record(z.string().min(1).max(64), aggregateConfigValueSchema).default({}),
  aggregateMetrics: z.record(z.string().min(1).max(64), z.number().finite()).default({}),
  failureCategories: z.array(z.string().min(1).max(128)).default([]),
  startedAt: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
})

export type ExperimentRecordV1 = z.infer<typeof experimentRecordV1Schema>

export const zoteroCreatorSchema = z.object({
  creatorType: z.string().default("author"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(),
})

export type ZoteroCreator = z.infer<typeof zoteroCreatorSchema>

export const zoteroItemDataSchema = z.object({
  key: z.string().min(1).max(64),
  version: z.number().int().nonnegative().optional(),
  itemType: z.string().min(1),
  title: z.string().default("Untitled"),
  creators: z.array(zoteroCreatorSchema).default([]),
  abstractNote: z.string().default(""),
  date: z.string().default(""),
  DOI: z.string().optional(),
  url: z.string().optional(),
  tags: z.array(z.object({ tag: z.string() })).default([]),
  collections: z.array(z.string()).default([]),
  relations: z.record(z.string(), z.unknown()).default({}),
})

export type ZoteroItemData = z.infer<typeof zoteroItemDataSchema>

export const zoteroApiResponseItemSchema = z.object({
  key: z.string(),
  version: z.number().optional(),
  library: z
    .object({
      type: z.string(),
      id: z.number().or(z.string()),
      name: z.string().optional(),
    })
    .optional(),
  data: zoteroItemDataSchema,
})

export type ZoteroApiResponseItem = z.infer<typeof zoteroApiResponseItemSchema>
