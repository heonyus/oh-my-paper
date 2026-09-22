import { useMemo } from "react"
import type { KnowledgeClientOps } from "./knowledgeTypes"

export function useKnowledgeClientOps(): KnowledgeClientOps {
  return useMemo<KnowledgeClientOps>(
    () => ({
      findNodes: (filter) => window.ohmypaper.knowledge.findNodes(filter),
      getNode: (id) => window.ohmypaper.knowledge.getNode(id),
      createNode: (input) => window.ohmypaper.knowledge.createNode(input),
      updateNode: (input) => window.ohmypaper.knowledge.updateNode(input),
      deleteNode: (id) => window.ohmypaper.knowledge.deleteNode(id),
      findRelations: (filter) => window.ohmypaper.knowledge.findRelations(filter),
      createRelation: (input) => window.ohmypaper.knowledge.createRelation(input),
      updateRelation: (input) => window.ohmypaper.knowledge.updateRelation(input),
      getBacklinks: (id) => window.ohmypaper.knowledge.getBacklinks(id),
      getNeighbourGraph: (id, maxDepth) =>
        window.ohmypaper.knowledge.getNeighbourGraph(id, maxDepth),
      getEvidenceNavigation: (id) => window.ohmypaper.knowledge.getEvidenceNavigation(id),
      createEvidenceAnchor: (input) => window.ohmypaper.knowledge.createEvidenceAnchor(input),
      getEvidenceAnchor: (id) => window.ohmypaper.knowledge.getEvidenceAnchor(id),
      getDocVersionsByHash: (hash) => window.ohmypaper.knowledge.findDocumentVersionsByHash(hash),
      getOrCreateDefaultBoard: () => window.ohmypaper.knowledge.getOrCreateDefaultBoard(),
      listBoards: () => window.ohmypaper.knowledge.listBoards(),
      createBoard: (title, description) =>
        window.ohmypaper.knowledge.createBoard(title, description),
      findPlacementsForBoard: (id) => window.ohmypaper.knowledge.findPlacementsForBoard(id),
      createPlacement: (input) => window.ohmypaper.knowledge.createPlacement(input),
      updatePlacement: (input) => window.ohmypaper.knowledge.updatePlacement(input),
      deletePlacement: (id) => window.ohmypaper.knowledge.deletePlacement(id),
    }),
    [],
  )
}
