import { useMemo } from "react"
import type { KnowledgeClientOps } from "./knowledgeTypes"

export function useKnowledgeClientOps(): KnowledgeClientOps {
  return useMemo<KnowledgeClientOps>(
    () => ({
      findNodes: (filter) => window.scourgify.knowledge.findNodes(filter),
      getNode: (id) => window.scourgify.knowledge.getNode(id),
      createNode: (input) => window.scourgify.knowledge.createNode(input),
      updateNode: (input) => window.scourgify.knowledge.updateNode(input),
      deleteNode: (id) => window.scourgify.knowledge.deleteNode(id),
      findRelations: (filter) => window.scourgify.knowledge.findRelations(filter),
      createRelation: (input) => window.scourgify.knowledge.createRelation(input),
      updateRelation: (input) => window.scourgify.knowledge.updateRelation(input),
      getBacklinks: (id) => window.scourgify.knowledge.getBacklinks(id),
      getNeighbourGraph: (id, maxDepth) =>
        window.scourgify.knowledge.getNeighbourGraph(id, maxDepth),
      getEvidenceNavigation: (id) => window.scourgify.knowledge.getEvidenceNavigation(id),
      createEvidenceAnchor: (input) => window.scourgify.knowledge.createEvidenceAnchor(input),
      getEvidenceAnchor: (id) => window.scourgify.knowledge.getEvidenceAnchor(id),
      getDocVersionsByHash: (hash) => window.scourgify.knowledge.findDocumentVersionsByHash(hash),
      getOrCreateDefaultBoard: () => window.scourgify.knowledge.getOrCreateDefaultBoard(),
      listBoards: () => window.scourgify.knowledge.listBoards(),
      createBoard: (title, description) =>
        window.scourgify.knowledge.createBoard(title, description),
      findPlacementsForBoard: (id) => window.scourgify.knowledge.findPlacementsForBoard(id),
      createPlacement: (input) => window.scourgify.knowledge.createPlacement(input),
      updatePlacement: (input) => window.scourgify.knowledge.updatePlacement(input),
      deletePlacement: (id) => window.scourgify.knowledge.deletePlacement(id),
    }),
    [],
  )
}
