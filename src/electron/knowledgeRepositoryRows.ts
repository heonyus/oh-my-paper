import { z } from "zod"
import {
  type BoardRecord,
  boardRecordSchema,
  type DocumentVersionRecord,
  documentVersionRecordSchema,
  type EvidenceAnchor,
  evidenceAnchorSchema,
  type KnowledgeNode,
  type KnowledgeRelation,
  knowledgeNodeSchema,
  knowledgeRelationSchema,
  type PlacementRecord,
  placementRecordSchema,
} from "../shared/knowledgeSchemas"

export const nodeRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  aliases_json: z.string(),
  metadata_json: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type NodeRow = z.infer<typeof nodeRowSchema>

export const relationRowSchema = z.object({
  id: z.string(),
  source_id: z.string(),
  target_id: z.string(),
  predicate: z.string(),
  provenance_source: z.string(),
  provenance_model: z.string().nullable(),
  provenance_extractor_version: z.string().nullable(),
  evidence_ids_json: z.string(),
  source_endpoint_json: z.string().nullish(),
  target_endpoint_json: z.string().nullish(),
  review_state: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type RelationRow = z.infer<typeof relationRowSchema>

export const anchorRowSchema = z.object({
  id: z.string(),
  document_version_id: z.string(),
  page: z.number(),
  quote: z.string(),
  x: z.number(),
  y: z.number(),
  fragments_json: z.string(),
  ast_ranges_json: z.string().nullable(),
  created_at: z.string(),
})
export type AnchorRow = z.infer<typeof anchorRowSchema>

export const placementRowSchema = z.object({
  id: z.string(),
  board_id: z.string(),
  node_id: z.string(),
  card_id: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number().nullable(),
  minimized: z.number(),
  z_index: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type PlacementRow = z.infer<typeof placementRowSchema>

export const boardRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type BoardRow = z.infer<typeof boardRowSchema>

export const docVersionRowSchema = z.object({
  id: z.string(),
  original_document_id: z.string(),
  paper_node_id: z.string(),
  hash: z.string(),
  metadata_json: z.string(),
  created_at: z.string(),
})
export type DocVersionRow = z.infer<typeof docVersionRowSchema>

export const externalMappingRowSchema = z.object({
  id: z.string(),
  node_id: z.string(),
  system: z.string(),
  external_id: z.string(),
  is_full_text_reviewed: z.number(),
  metadata_json: z.string(),
  created_at: z.string(),
})
export type ExternalMappingRow = z.infer<typeof externalMappingRowSchema>

export const workspaceSettingsRowSchema = z.object({
  id: z.number(),
  sidebar_open: z.number(),
  outline_width: z.number(),
  research_sidebar_width: z.number(),
  ui_font_family: z.string(),
  ui_font_scale: z.number(),
  theme: z.string(),
  minimap_visible: z.number(),
  viewport_x: z.number(),
  viewport_y: z.number(),
  viewport_zoom: z.number(),
  active_document_id: z.string().nullable(),
  revision: z.number().default(1),
  updated_at: z.string(),
})
export type WorkspaceSettingsRow = z.infer<typeof workspaceSettingsRowSchema>

export const insightRowSchema = z.object({
  document_id: z.string(),
  kind: z.string(),
  value: z.string(),
  updated_at: z.string(),
})
export type InsightRow = z.infer<typeof insightRowSchema>

export const countRowSchema = z.object({
  count: z.number(),
})

export const schemaVersionRowSchema = z.object({
  version: z.number().nullable(),
})

export function parseJsonSafe(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText)
  } catch {
    return {}
  }
}

export function rowToNode(raw: unknown): KnowledgeNode {
  const row = nodeRowSchema.parse(raw)
  return knowledgeNodeSchema.parse({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    aliases: parseJsonSafe(row.aliases_json),
    metadata: parseJsonSafe(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function rowToRelation(raw: unknown): KnowledgeRelation {
  const row = relationRowSchema.parse(raw)
  return knowledgeRelationSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    predicate: row.predicate,
    provenance: {
      source: row.provenance_source,
      model: row.provenance_model,
      extractorVersion: row.provenance_extractor_version,
    },
    evidenceIds: parseJsonSafe(row.evidence_ids_json),
    sourceEndpoint: row.source_endpoint_json ? JSON.parse(row.source_endpoint_json) : undefined,
    targetEndpoint: row.target_endpoint_json ? JSON.parse(row.target_endpoint_json) : undefined,
    reviewState: row.review_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function rowToAnchor(raw: unknown): EvidenceAnchor {
  const row = anchorRowSchema.parse(raw)
  return evidenceAnchorSchema.parse({
    id: row.id,
    documentVersionId: row.document_version_id,
    page: row.page,
    quote: row.quote,
    x: row.x,
    y: row.y,
    fragments: parseJsonSafe(row.fragments_json),
    astRanges: row.ast_ranges_json ? parseJsonSafe(row.ast_ranges_json) : undefined,
    createdAt: row.created_at,
  })
}

export function rowToPlacement(raw: unknown): PlacementRecord {
  const row = placementRowSchema.parse(raw)
  return placementRecordSchema.parse({
    id: row.id,
    boardId: row.board_id,
    nodeId: row.node_id,
    cardId: row.card_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    minimized: Boolean(row.minimized),
    zIndex: row.z_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function rowToBoard(raw: unknown): BoardRecord {
  const row = boardRowSchema.parse(raw)
  return boardRecordSchema.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function rowToDocVersion(raw: unknown): DocumentVersionRecord {
  const row = docVersionRowSchema.parse(raw)
  return documentVersionRecordSchema.parse({
    id: row.id,
    originalDocumentId: row.original_document_id,
    paperNodeId: row.paper_node_id,
    hash: row.hash,
    metadata: parseJsonSafe(row.metadata_json),
    createdAt: row.created_at,
  })
}
