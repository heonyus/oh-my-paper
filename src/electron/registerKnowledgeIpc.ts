import { ipcMain } from "electron"
import { z } from "zod"
import { ipcChannels } from "../shared/ipcChannels"
import { knowledgeActionChannels, linkEvidenceInputSchema } from "../shared/knowledgeActions"
import {
  backlinkItemSchema,
  createBoardInputSchema,
  createEvidenceAnchorInputSchema,
  createNodeInputSchema,
  createPlacementInputSchema,
  createRelationInputSchema,
  evidenceNavigationTargetSchema,
  neighbourGraphOptionsSchema,
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
  knowledgeRelationIdSchema,
  knowledgeRelationSchema,
  placementIdSchema,
  placementRecordSchema,
} from "../shared/knowledgeSchemas"
import type { CollectionService } from "./collectionService"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { linkKnowledgeEvidence } from "./linkKnowledgeEvidence"

export function registerKnowledgeIpc(
  repo: KnowledgeRepository,
  collectionService?: CollectionService,
): () => void {
  ipcMain.handle(knowledgeActionChannels.linkEvidence, async (_event, value: unknown) => {
    const input = linkEvidenceInputSchema.parse(value)
    return knowledgeNodeSchema.parse(await linkKnowledgeEvidence(repo, input, collectionService))
  })
  ipcMain.handle(ipcChannels.knowledgeNodeFind, async (_event, value: unknown) => {
    const filter = value ? nodeFilterSchema.parse(value) : undefined
    const nodes = collectionService?.findNodes(filter) ?? repo.findNodes(filter)
    return z.array(knowledgeNodeSchema).parse(nodes)
  })

  ipcMain.handle(ipcChannels.knowledgeNodeGet, async (_event, value: unknown) => {
    const id = knowledgeNodeIdSchema.parse(value)
    const node = collectionService?.getNode(id) ?? repo.getNode(id)
    return knowledgeNodeSchema.nullable().parse(node)
  })

  ipcMain.handle(ipcChannels.knowledgeNodeCreate, async (_event, value: unknown) => {
    const input = createNodeInputSchema.parse(value)
    const created = collectionService
      ? await collectionService.createNode(input)
      : repo.createNode(input)
    return knowledgeNodeSchema.parse(created)
  })

  ipcMain.handle(ipcChannels.knowledgeNodeUpdate, async (_event, value: unknown) => {
    const input = updateNodeInputSchema.parse(value)
    const updated = collectionService
      ? await collectionService.updateNode(input)
      : repo.updateNode(input)
    return knowledgeNodeSchema.parse(updated)
  })

  ipcMain.handle(ipcChannels.knowledgeNodeDelete, async (_event, value: unknown) => {
    const id = knowledgeNodeIdSchema.parse(value)
    const deleted = collectionService ? await collectionService.deleteNode(id) : repo.deleteNode(id)
    return z.boolean().parse(deleted)
  })

  ipcMain.handle(ipcChannels.knowledgeRelationFind, async (_event, value: unknown) => {
    const filter = value ? relationFilterSchema.parse(value) : undefined
    const relations = repo.findRelations(filter)
    return z.array(knowledgeRelationSchema).parse(relations)
  })

  ipcMain.handle(ipcChannels.knowledgeRelationGet, async (_event, value: unknown) => {
    const id = knowledgeRelationIdSchema.parse(value)
    const relation = repo.getRelation(id)
    return knowledgeRelationSchema.nullable().parse(relation)
  })

  ipcMain.handle(ipcChannels.knowledgeRelationCreate, async (_event, value: unknown) => {
    const input = createRelationInputSchema.parse(value)
    const created = repo.createRelation(input)
    return knowledgeRelationSchema.parse(created)
  })

  ipcMain.handle(ipcChannels.knowledgeRelationUpdate, async (_event, value: unknown) => {
    const input = updateRelationInputSchema.parse(value)
    const updated = repo.updateRelation(input)
    return knowledgeRelationSchema.parse(updated)
  })

  ipcMain.handle(ipcChannels.knowledgeBacklinksGet, async (_event, value: unknown) => {
    const id = knowledgeNodeIdSchema.parse(value)
    const backlinks = repo.getBacklinks(id)
    return z.array(backlinkItemSchema).parse(backlinks)
  })

  ipcMain.handle(ipcChannels.knowledgeNeighbourGraphGet, async (_event, value: unknown) => {
    const { nodeId, maxDepth, options } = z
      .object({
        nodeId: knowledgeNodeIdSchema,
        maxDepth: z.number().int().nonnegative().optional(),
        options: neighbourGraphOptionsSchema.optional(),
      })
      .parse(value)
    const graph = repo.getNeighbourGraph(nodeId, maxDepth, options)
    return nodeNeighbourGraphSchema.parse(graph)
  })

  ipcMain.handle(ipcChannels.knowledgeEvidenceAnchorCreate, async (_event, value: unknown) => {
    const input = createEvidenceAnchorInputSchema.parse(value)
    const created = repo.createEvidenceAnchor(input)
    return evidenceAnchorSchema.parse(created)
  })

  ipcMain.handle(ipcChannels.knowledgeEvidenceAnchorGet, async (_event, value: unknown) => {
    const id = evidenceAnchorIdSchema.parse(value)
    const anchor = repo.getEvidenceAnchor(id)
    return evidenceAnchorSchema.nullable().parse(anchor)
  })

  ipcMain.handle(ipcChannels.knowledgeEvidenceNavigationGet, async (_event, value: unknown) => {
    const id = evidenceAnchorIdSchema.parse(value)
    const nav = repo.getEvidenceNavigation(id)
    return evidenceNavigationTargetSchema.nullable().parse(nav)
  })

  ipcMain.handle(ipcChannels.knowledgeDocumentVersionCreate, async (_event, value: unknown) => {
    const input = documentVersionRecordSchema.parse(value)
    const created = repo.createDocumentVersion(input)
    return documentVersionRecordSchema.parse(created)
  })

  ipcMain.handle(ipcChannels.knowledgeDocumentVersionGet, async (_event, value: unknown) => {
    const id = documentVersionIdSchema.parse(value)
    const version = repo.getDocumentVersion(id)
    return documentVersionRecordSchema.nullable().parse(version)
  })

  ipcMain.handle(ipcChannels.knowledgeDocumentVersionsByHash, async (_event, value: unknown) => {
    const hash = z.string().parse(value)
    const versions = repo.findDocumentVersionsByHash(hash)
    return z.array(documentVersionRecordSchema).parse(versions)
  })

  ipcMain.handle(ipcChannels.knowledgeDefaultBoardGet, async () => {
    const board = repo.getOrCreateDefaultBoard()
    return boardRecordSchema.parse(board)
  })

  ipcMain.handle(ipcChannels.knowledgeBoardGet, async (_event, value: unknown) => {
    const id = boardIdSchema.parse(value)
    const board = repo.getBoard(id)
    return boardRecordSchema.nullable().parse(board)
  })

  ipcMain.handle(ipcChannels.knowledgeBoardsList, async () => {
    const boards = repo.listBoards()
    return z.array(boardRecordSchema).parse(boards)
  })

  ipcMain.handle(ipcChannels.knowledgeBoardCreate, async (_event, value: unknown) => {
    const { title, description } = createBoardInputSchema.parse(value)
    const board = repo.createBoard(title, description)
    return boardRecordSchema.parse(board)
  })

  ipcMain.handle(ipcChannels.knowledgePlacementsFind, async (_event, value: unknown) => {
    const boardId = boardIdSchema.parse(value)
    const placements = repo.findPlacementsForBoard(boardId)
    return z.array(placementRecordSchema).parse(placements)
  })

  ipcMain.handle(ipcChannels.knowledgePlacementsForNodeFind, async (_event, value: unknown) => {
    const nodeId = knowledgeNodeIdSchema.parse(value)
    return z.array(placementRecordSchema).parse(repo.findPlacementsForNode(nodeId))
  })

  ipcMain.handle(ipcChannels.knowledgePlacementCreate, async (_event, value: unknown) => {
    const input = createPlacementInputSchema.parse(value)
    const created = repo.createPlacement(input)
    return placementRecordSchema.parse(created)
  })

  ipcMain.handle(ipcChannels.knowledgePlacementUpdate, async (_event, value: unknown) => {
    const input = updatePlacementInputSchema.parse(value)
    const updated = repo.updatePlacement(input)
    return placementRecordSchema.parse(updated)
  })

  ipcMain.handle(ipcChannels.knowledgePlacementDelete, async (_event, value: unknown) => {
    const id = placementIdSchema.parse(value)
    return z.boolean().parse(repo.deletePlacement(id))
  })

  return () => {
    ipcMain.removeHandler(knowledgeActionChannels.linkEvidence)
    ipcMain.removeHandler(ipcChannels.knowledgeNodeFind)
    ipcMain.removeHandler(ipcChannels.knowledgeNodeGet)
    ipcMain.removeHandler(ipcChannels.knowledgeNodeCreate)
    ipcMain.removeHandler(ipcChannels.knowledgeNodeUpdate)
    ipcMain.removeHandler(ipcChannels.knowledgeNodeDelete)
    ipcMain.removeHandler(ipcChannels.knowledgeRelationFind)
    ipcMain.removeHandler(ipcChannels.knowledgeRelationGet)
    ipcMain.removeHandler(ipcChannels.knowledgeRelationCreate)
    ipcMain.removeHandler(ipcChannels.knowledgeRelationUpdate)
    ipcMain.removeHandler(ipcChannels.knowledgeBacklinksGet)
    ipcMain.removeHandler(ipcChannels.knowledgeNeighbourGraphGet)
    ipcMain.removeHandler(ipcChannels.knowledgeEvidenceAnchorCreate)
    ipcMain.removeHandler(ipcChannels.knowledgeEvidenceAnchorGet)
    ipcMain.removeHandler(ipcChannels.knowledgeEvidenceNavigationGet)
    ipcMain.removeHandler(ipcChannels.knowledgeDocumentVersionCreate)
    ipcMain.removeHandler(ipcChannels.knowledgeDocumentVersionGet)
    ipcMain.removeHandler(ipcChannels.knowledgeDocumentVersionsByHash)
    ipcMain.removeHandler(ipcChannels.knowledgeDefaultBoardGet)
    ipcMain.removeHandler(ipcChannels.knowledgeBoardGet)
    ipcMain.removeHandler(ipcChannels.knowledgeBoardsList)
    ipcMain.removeHandler(ipcChannels.knowledgeBoardCreate)
    ipcMain.removeHandler(ipcChannels.knowledgePlacementsFind)
    ipcMain.removeHandler(ipcChannels.knowledgePlacementsForNodeFind)
    ipcMain.removeHandler(ipcChannels.knowledgePlacementCreate)
    ipcMain.removeHandler(ipcChannels.knowledgePlacementUpdate)
    ipcMain.removeHandler(ipcChannels.knowledgePlacementDelete)
  }
}
