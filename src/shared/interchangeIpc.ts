import { z } from "zod"
import {
  canvasSidecarMetadataSchema,
  experimentRecordV1Schema,
  jsonCanvasV1Schema,
  markdownFrontMatterSchema,
} from "./interchangeSchemas"
import {
  boardIdSchema,
  externalMappingSchema,
  knowledgeNodeIdSchema,
  knowledgeNodeSchema,
  knowledgeRelationSchema,
  placementRecordSchema,
} from "./knowledgeSchemas"

export const interchangeMarkdownExportRequestSchema = z.object({
  nodeId: knowledgeNodeIdSchema,
})

export const parsedMarkdownNodeSchema = z.object({
  frontMatter: markdownFrontMatterSchema,
  body: z.string(),
})

export const markdownConflictSchema = z.object({
  nodeId: knowledgeNodeIdSchema,
  existingTitle: z.string(),
  importedTitle: z.string(),
  hasDifferentKind: z.boolean(),
  hasDifferentBody: z.boolean(),
  existingAliases: z.array(z.string()),
  importedAliases: z.array(z.string()),
})

export const markdownImportPreviewSchema = z.object({
  previewId: z.string().uuid(),
  parsedNodes: z.array(parsedMarkdownNodeSchema),
  conflicts: z.array(markdownConflictSchema),
  newNodes: z.array(parsedMarkdownNodeSchema),
  parseErrors: z.array(z.object({ fileIndex: z.number().int(), error: z.string() })),
  duplicateIdsInBatch: z.array(knowledgeNodeIdSchema),
  isValid: z.boolean(),
})

export const canvasExportResultSchema = z.object({
  canvas: jsonCanvasV1Schema,
  sidecar: canvasSidecarMetadataSchema,
})

export const canvasImportPreviewSchema = z.object({
  previewId: z.string().uuid(),
  boardId: z.string(),
  nodesToPlace: z.array(
    z.object({
      nodeId: knowledgeNodeIdSchema,
      title: z.string(),
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite(),
      height: z.number().finite().nullable(),
    }),
  ),
  relations: z.array(knowledgeRelationSchema),
  missingNodes: z.array(z.string()),
  isValid: z.boolean(),
})

export const experimentImportPreviewSchema = z.object({
  previewId: z.string().uuid(),
  records: z.array(experimentRecordV1Schema),
  errors: z.array(z.object({ line: z.number().int(), message: z.string() })),
  sensitiveKeysDetected: z.array(z.string()),
  isValid: z.boolean(),
})

export const zoteroImportItemPreviewSchema = z.object({
  libraryKey: z.string(),
  itemKey: z.string(),
  title: z.string(),
  itemType: z.string(),
  doi: z.string().nullable(),
  date: z.string(),
  creators: z.array(z.string()),
  abstractNote: z.string(),
  existingMapping: externalMappingSchema.nullable(),
  matchType: z.enum(["none", "external_id_match", "doi_match"]),
  libraryType: z.string().optional(),
  libraryId: z.union([z.string(), z.number()]).optional(),
  proposedMergeNodeId: knowledgeNodeIdSchema.nullable().optional(),
})

export const zoteroImportPreviewSchema = z.object({
  previewId: z.string().uuid(),
  items: z.array(zoteroImportItemPreviewSchema),
  duplicateKeysInBatch: z.array(z.string()),
  totalItems: z.number().int().nonnegative(),
  isValid: z.boolean(),
  invalidCount: z.number().int().nonnegative().optional(),
  validationErrors: z.array(z.object({ index: z.number().int(), error: z.string() })).optional(),
})

export const zoteroCommitResultSchema = z.object({
  createdNodeIds: z.array(knowledgeNodeIdSchema),
  mappedExternalIds: z.array(z.string()),
  skippedItemKeys: z.array(z.string()),
})

export const chooseFilesFilterSchema = z.object({
  name: z.string(),
  extensions: z.array(z.string()),
})

export const chooseFilesRequestSchema = z.object({
  filters: z.array(chooseFilesFilterSchema).default([]),
  multiple: z.boolean().default(false),
})

export const saveFileRequestSchema = z.object({
  defaultName: z.string(),
  content: z.string().max(10_000_000),
  filters: z.array(chooseFilesFilterSchema).default([]),
})

export const interchangeMarkdownImportPreviewRequestSchema = z.object({
  files: z.array(z.string().min(1).max(1_000_000)).min(1).max(16),
})
export const interchangeMarkdownImportCommitRequestSchema = z.object({
  previewId: z.string().uuid(),
})
export const interchangeCanvasExportRequestSchema = z.object({ boardId: boardIdSchema })
export const interchangeCanvasImportPreviewRequestSchema = z.object({
  canvasJson: z.string().min(1).max(10_000_000),
  sidecarJson: z.string().min(1).max(10_000_000),
})
export const interchangeCanvasImportCommitRequestSchema = z.object({
  previewId: z.string().uuid(),
  targetBoardId: boardIdSchema,
})
export const interchangeExperimentPreviewRequestSchema = z.object({
  rawLines: z.string().max(10_000_000),
})
export const interchangeZoteroFilePreviewRequestSchema = z.object({
  rawJson: z.string().min(1).max(10_000_000),
  libraryKey: z.string().min(1).max(256).optional(),
})
export const interchangeZoteroFetchPreviewRequestSchema = z.object({
  options: z.record(z.string(), z.unknown()).optional(),
  libraryKey: z.string().min(1).max(256).optional(),
})
export const interchangeZoteroCommitRequestSchema = z.object({
  previewId: z.string().uuid(),
})

export const interchangeExperimentCommitRequestSchema = z.object({
  previewId: z.string().uuid(),
  hypothesisNodeId: knowledgeNodeIdSchema.optional(),
  targetBoardId: boardIdSchema.optional(),
})
export const experimentCommitResultSchema = z.object({
  createdNodes: z.array(knowledgeNodeSchema),
  mappedRunIds: z.array(z.string()),
  createdRelations: z.array(knowledgeRelationSchema),
  createdPlacements: z.array(placementRecordSchema),
})
