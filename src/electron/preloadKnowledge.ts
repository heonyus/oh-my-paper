import { ipcRenderer } from "electron"
import { z } from "zod"
import type { OhMyPaperApi } from "../shared/ipc"
import { ipcChannels } from "../shared/ipcChannels"
import {
  knowledgeActionChannels,
  linkEvidenceInputSchema,
  proposalResultSchema,
  proposalScopeSchema,
} from "../shared/knowledgeActions"
import {
  backlinkItemSchema,
  createEvidenceAnchorInputSchema,
  createNodeInputSchema,
  createPlacementInputSchema,
  createRelationInputSchema,
  evidenceNavigationTargetSchema,
  nodeFilterSchema,
  nodeNeighbourGraphSchema,
  relationFilterSchema,
  updateNodeInputSchema,
  updatePlacementInputSchema,
  updateRelationInputSchema,
} from "../shared/knowledgeIpc"
import {
  boardIdSchema,
  boardRecordSchema,
  documentVersionIdSchema,
  documentVersionRecordSchema,
  evidenceAnchorIdSchema,
  evidenceAnchorSchema,
  knowledgeNodeIdSchema,
  knowledgeNodeSchema,
  knowledgeRelationSchema,
  placementIdSchema,
  placementRecordSchema,
} from "../shared/knowledgeSchemas"

export function createPreloadKnowledge(): OhMyPaperApi["knowledge"] {
  return {
    linkEvidence: async (input) =>
      knowledgeNodeSchema.parse(
        await ipcRenderer.invoke(
          knowledgeActionChannels.linkEvidence,
          linkEvidenceInputSchema.parse(input),
        ),
      ),
    proposeRelations: async (nodeIds) =>
      proposalResultSchema.parse(
        await ipcRenderer.invoke(
          knowledgeActionChannels.propose,
          proposalScopeSchema.parse({ nodeIds }),
        ),
      ),
    cancelProposal: async () => {
      await ipcRenderer.invoke(knowledgeActionChannels.cancel)
    },
    findNodes: async (filter) =>
      z
        .array(knowledgeNodeSchema)
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgeNodeFind,
            filter ? nodeFilterSchema.parse(filter) : undefined,
          ),
        ),
    getNode: async (id) =>
      knowledgeNodeSchema
        .nullable()
        .parse(
          await ipcRenderer.invoke(ipcChannels.knowledgeNodeGet, knowledgeNodeIdSchema.parse(id)),
        ),
    createNode: async (input) =>
      knowledgeNodeSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.knowledgeNodeCreate,
          createNodeInputSchema.parse(input),
        ),
      ),
    updateNode: async (input) =>
      knowledgeNodeSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.knowledgeNodeUpdate,
          updateNodeInputSchema.parse(input),
        ),
      ),
    deleteNode: async (id) =>
      z
        .boolean()
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgeNodeDelete,
            knowledgeNodeIdSchema.parse(id),
          ),
        ),
    findRelations: async (filter) =>
      z
        .array(knowledgeRelationSchema)
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgeRelationFind,
            filter ? relationFilterSchema.parse(filter) : undefined,
          ),
        ),
    createRelation: async (input) =>
      knowledgeRelationSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.knowledgeRelationCreate,
          createRelationInputSchema.parse(input),
        ),
      ),
    updateRelation: async (input) =>
      knowledgeRelationSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.knowledgeRelationUpdate,
          updateRelationInputSchema.parse(input),
        ),
      ),
    getBacklinks: async (nodeId) =>
      z
        .array(backlinkItemSchema)
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgeBacklinksGet,
            knowledgeNodeIdSchema.parse(nodeId),
          ),
        ),
    getNeighbourGraph: async (nodeId, maxDepth) =>
      nodeNeighbourGraphSchema.parse(
        await ipcRenderer.invoke(ipcChannels.knowledgeNeighbourGraphGet, {
          nodeId: knowledgeNodeIdSchema.parse(nodeId),
          maxDepth,
        }),
      ),
    createEvidenceAnchor: async (input) =>
      evidenceAnchorSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.knowledgeEvidenceAnchorCreate,
          createEvidenceAnchorInputSchema.parse(input),
        ),
      ),
    getEvidenceAnchor: async (id) =>
      evidenceAnchorSchema
        .nullable()
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgeEvidenceAnchorGet,
            evidenceAnchorIdSchema.parse(id),
          ),
        ),
    getEvidenceNavigation: async (anchorId) =>
      evidenceNavigationTargetSchema
        .nullable()
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgeEvidenceNavigationGet,
            evidenceAnchorIdSchema.parse(anchorId),
          ),
        ),
    createDocumentVersion: async (version) =>
      documentVersionRecordSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.knowledgeDocumentVersionCreate,
          documentVersionRecordSchema.parse(version),
        ),
      ),
    getDocumentVersion: async (id) =>
      documentVersionRecordSchema
        .nullable()
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgeDocumentVersionGet,
            documentVersionIdSchema.parse(id),
          ),
        ),
    findDocumentVersionsByHash: async (hash) =>
      z
        .array(documentVersionRecordSchema)
        .parse(await ipcRenderer.invoke(ipcChannels.knowledgeDocumentVersionsByHash, hash)),
    getOrCreateDefaultBoard: async () =>
      boardRecordSchema.parse(await ipcRenderer.invoke(ipcChannels.knowledgeDefaultBoardGet)),
    listBoards: async () =>
      z.array(boardRecordSchema).parse(await ipcRenderer.invoke(ipcChannels.knowledgeBoardsList)),
    createBoard: async (title, description) =>
      boardRecordSchema.parse(
        await ipcRenderer.invoke(ipcChannels.knowledgeBoardCreate, {
          title,
          description,
        }),
      ),
    getBoard: async (id) =>
      boardRecordSchema
        .nullable()
        .parse(await ipcRenderer.invoke(ipcChannels.knowledgeBoardGet, boardIdSchema.parse(id))),
    findPlacementsForBoard: async (boardId) =>
      z
        .array(placementRecordSchema)
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgePlacementsFind,
            boardIdSchema.parse(boardId),
          ),
        ),
    findPlacementsForNode: async (nodeId) =>
      z
        .array(placementRecordSchema)
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgePlacementsForNodeFind,
            knowledgeNodeIdSchema.parse(nodeId),
          ),
        ),
    createPlacement: async (input) =>
      placementRecordSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.knowledgePlacementCreate,
          createPlacementInputSchema.parse(input),
        ),
      ),
    updatePlacement: async (input) =>
      placementRecordSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.knowledgePlacementUpdate,
          updatePlacementInputSchema.parse(input),
        ),
      ),
    deletePlacement: async (id) =>
      z
        .boolean()
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.knowledgePlacementDelete,
            placementIdSchema.parse(id),
          ),
        ),
  }
}
