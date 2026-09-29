import type { DatabaseSync } from "node:sqlite"
import type {
  BoardId,
  BoardRecord,
  DocumentVersionId,
  DocumentVersionRecord,
  EvidenceAnchor,
  EvidenceAnchorId,
  ExternalMapping,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
  KnowledgeRelationId,
  PlacementId,
  PlacementRecord,
} from "../shared/knowledgeSchemas"
import type {
  BacklinkItem,
  CreateEvidenceAnchorInput,
  CreateNodeInput,
  CreatePlacementInput,
  CreateRelationInput,
  EvidenceNavigationTarget,
  NeighbourGraphOptions,
  NodeFilter,
  NodeNeighbourGraph,
  RelationFilter,
  UpdateNodeInput,
  UpdatePlacementInput,
  UpdateRelationInput,
} from "../shared/knowledgeTypes"
import { KnowledgeEvidenceOperations } from "./knowledgeRepositoryEvidence"
import { type CanonicalNoteProjection, KnowledgeNodeOperations } from "./knowledgeRepositoryNodes"
import { type CardPlacement, KnowledgePlacementOperations } from "./knowledgeRepositoryPlacements"
import { KnowledgeRelationOperations } from "./knowledgeRepositoryRelations"

export class KnowledgeRepository {
  private readonly nodes: KnowledgeNodeOperations
  private readonly relations: KnowledgeRelationOperations
  private readonly evidence: KnowledgeEvidenceOperations
  private readonly placements: KnowledgePlacementOperations

  constructor(
    readonly db: DatabaseSync,
    noteProjection?: CanonicalNoteProjection,
  ) {
    this.nodes = new KnowledgeNodeOperations(db, noteProjection)
    this.evidence = new KnowledgeEvidenceOperations(db)
    this.placements = new KnowledgePlacementOperations(db)
    this.relations = new KnowledgeRelationOperations(
      db,
      (id) => this.nodes.getNode(id),
      (id) => this.evidence.getEvidenceAnchor(id),
    )
  }

  createNode(input: CreateNodeInput): KnowledgeNode {
    return this.nodes.createNode(input)
  }

  getNode(id: KnowledgeNodeId): KnowledgeNode | null {
    return this.nodes.getNode(id)
  }

  nodeFromRow(raw: unknown): KnowledgeNode {
    return this.nodes.nodeFromRow(raw)
  }

  canonicalNoteBody(id: string, kind: string): string | null {
    return this.nodes.canonicalNoteBody(id, kind)
  }

  updateNode(input: UpdateNodeInput): KnowledgeNode {
    return this.nodes.updateNode(input)
  }

  deleteNode(id: KnowledgeNodeId): boolean {
    return this.nodes.deleteNode(id)
  }

  findNodes(filter?: NodeFilter): readonly KnowledgeNode[] {
    return this.nodes.findNodes(filter)
  }

  withCanonicalNoteWrite<T>(operation: () => T): T {
    return this.nodes.withCanonicalWrite(operation)
  }

  createRelation(input: CreateRelationInput): KnowledgeRelation {
    return this.relations.createRelation(input)
  }

  updateRelation(input: UpdateRelationInput): KnowledgeRelation {
    return this.relations.updateRelation(input)
  }

  getRelation(id: KnowledgeRelationId): KnowledgeRelation | null {
    return this.relations.getRelation(id)
  }

  findRelations(filter?: RelationFilter): readonly KnowledgeRelation[] {
    return this.relations.findRelations(filter)
  }

  getBacklinks(nodeId: KnowledgeNodeId): readonly BacklinkItem[] {
    return this.relations.getBacklinks(nodeId).map((item) => ({
      ...item,
      sourceNode: this.nodes.getNode(item.sourceNode.id) ?? item.sourceNode,
    }))
  }

  getNeighbourGraph(
    nodeId: KnowledgeNodeId,
    maxDepth = 1,
    options?: NeighbourGraphOptions,
  ): NodeNeighbourGraph {
    const graph = this.relations.getNeighbourGraph(nodeId, maxDepth, options)
    const rootNode = this.nodes.getNode(graph.rootNode.id) ?? graph.rootNode
    return {
      ...graph,
      rootNode,
      nodes: graph.nodes.map((node) => this.nodes.getNode(node.id) ?? node),
    }
  }

  createEvidenceAnchor(input: CreateEvidenceAnchorInput): EvidenceAnchor {
    return this.evidence.createEvidenceAnchor(input)
  }

  getEvidenceAnchor(id: EvidenceAnchorId): EvidenceAnchor | null {
    return this.evidence.getEvidenceAnchor(id)
  }

  getEvidenceNavigation(anchorId: EvidenceAnchorId): EvidenceNavigationTarget | null {
    return this.evidence.getEvidenceNavigation(anchorId)
  }

  createDocumentVersion(version: DocumentVersionRecord): DocumentVersionRecord {
    return this.evidence.createDocumentVersion(version)
  }

  getDocumentVersion(id: DocumentVersionId): DocumentVersionRecord | null {
    return this.evidence.getDocumentVersion(id)
  }

  findDocumentVersionsByHash(hash: string): readonly DocumentVersionRecord[] {
    return this.evidence.findDocumentVersionsByHash(hash)
  }

  findDocumentVersionsByDocId(documentId: string): readonly DocumentVersionRecord[] {
    return this.evidence.findDocumentVersionsByDocId(documentId)
  }

  deleteDocumentVersionsForDocument(documentId: string): readonly DocumentVersionRecord[] {
    return this.evidence.deleteDocumentVersionsForDocument(documentId)
  }

  listBoards(): readonly BoardRecord[] {
    return this.placements.listBoards()
  }

  createBoard(title: string, description = ""): BoardRecord {
    return this.placements.createBoard(title, description)
  }

  getBoard(id: BoardId): BoardRecord | null {
    return this.placements.getBoard(id)
  }

  getOrCreateDefaultBoard(): BoardRecord {
    return this.placements.getOrCreateDefaultBoard()
  }

  createPlacement(input: CreatePlacementInput): PlacementRecord {
    return this.placements.createPlacement(input)
  }

  updatePlacement(input: UpdatePlacementInput): PlacementRecord {
    return this.placements.updatePlacement(input)
  }

  getPlacement(id: PlacementId): PlacementRecord | null {
    return this.placements.getPlacement(id)
  }

  deletePlacement(id: PlacementId): boolean {
    return this.placements.deletePlacement(id)
  }

  findPlacementsForBoard(boardId: BoardId): readonly PlacementRecord[] {
    return this.placements.findPlacementsForBoard(boardId)
  }

  findCardPlacements(boardId: BoardId): readonly CardPlacement[] {
    return this.placements.findCardPlacements(boardId)
  }

  findPlacementsForNode(nodeId: KnowledgeNodeId): readonly PlacementRecord[] {
    return this.placements.findPlacementsForNode(nodeId)
  }

  createExternalMapping(
    mapping: Omit<ExternalMapping, "id" | "createdAt"> & { id?: string; createdAt?: string },
  ): ExternalMapping {
    return this.placements.createExternalMapping(mapping)
  }

  getExternalMapping(system: string, externalId: string): ExternalMapping | null {
    return this.placements.getExternalMapping(system, externalId)
  }
}
