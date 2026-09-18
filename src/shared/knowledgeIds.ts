import { z } from "zod"

export const knowledgeNodeIdSchema = z.string().uuid().brand("KnowledgeNodeId")
export const knowledgeRelationIdSchema = z.string().uuid().brand("KnowledgeRelationId")
export const evidenceAnchorIdSchema = z.string().uuid().brand("EvidenceAnchorId")
export const documentVersionIdSchema = z.string().uuid().brand("DocumentVersionId")
export const boardIdSchema = z.string().uuid().brand("BoardId")
export const placementIdSchema = z.string().uuid().brand("PlacementId")
export const externalMappingIdSchema = z.string().uuid().brand("ExternalMappingId")
