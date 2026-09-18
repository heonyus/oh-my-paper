import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import {
  type EvidenceAnchor,
  type EvidenceAnchorId,
  type KnowledgeNodeId,
  type KnowledgeRelation,
  type KnowledgeRelationId,
  knowledgeRelationIdSchema,
  knowledgeRelationSchema,
} from "../shared/knowledgeSchemas"
import type {
  BacklinkItem,
  CreateRelationInput,
  NeighbourGraphOptions,
  NodeNeighbourGraph,
  RelationFilter,
  UpdateRelationInput,
} from "../shared/knowledgeTypes"
import { withKnowledgeSavepoint } from "./knowledgeDatabaseTransaction"
import { validateKnowledgeEndpoint } from "./knowledgeEndpointValidation"
import { executeGetNeighbourGraph } from "./knowledgeRepositoryQueries"
import { relationRowSchema, rowToRelation } from "./knowledgeRepositoryRows"

export class KnowledgeRelationOperations {
  constructor(
    private readonly db: DatabaseSync,
    private readonly getNode: (
      id: KnowledgeNodeId,
    ) => import("../shared/knowledgeSchemas").KnowledgeNode | null,
    private readonly getEvidenceAnchor: (id: EvidenceAnchorId) => EvidenceAnchor | null,
  ) {}

  createRelation(input: CreateRelationInput): KnowledgeRelation {
    return withKnowledgeSavepoint(this.db, () => {
      const sourceNode = this.getNode(input.sourceId)
      if (!sourceNode) throw new Error(`Source node not found: ${input.sourceId}`)
      const targetNode = this.getNode(input.targetId)
      if (!targetNode) throw new Error(`Target node not found: ${input.targetId}`)
      validateKnowledgeEndpoint(this.db, sourceNode, input.sourceEndpoint)
      validateKnowledgeEndpoint(this.db, targetNode, input.targetEndpoint)

      if (input.evidenceIds && input.evidenceIds.length > 0) {
        for (const eid of input.evidenceIds) {
          const anchor = this.getEvidenceAnchor(eid)
          if (!anchor) {
            throw new Error(`Evidence anchor not found: ${eid}`)
          }
        }
      }

      const id = input.id ?? knowledgeRelationIdSchema.parse(randomUUID())
      const now = new Date().toISOString()
      const relation = knowledgeRelationSchema.parse({
        id,
        sourceId: input.sourceId,
        targetId: input.targetId,
        sourceEndpoint: input.sourceEndpoint,
        targetEndpoint: input.targetEndpoint,
        predicate: input.predicate,
        provenance: input.provenance,
        evidenceIds: input.evidenceIds ?? [],
        reviewState: input.reviewState ?? "proposed",
        createdAt: now,
        updatedAt: now,
      })

      this.db
        .prepare(`
      INSERT INTO knowledge_relations
      (id, source_id, target_id, predicate, provenance_source, provenance_model, provenance_extractor_version, evidence_ids_json, review_state, created_at, updated_at, source_endpoint_json, target_endpoint_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
        .run(
          relation.id,
          relation.sourceId,
          relation.targetId,
          relation.predicate,
          relation.provenance.source,
          relation.provenance.model,
          relation.provenance.extractorVersion,
          JSON.stringify(relation.evidenceIds),
          relation.reviewState,
          relation.createdAt,
          relation.updatedAt,
          relation.sourceEndpoint ? JSON.stringify(relation.sourceEndpoint) : null,
          relation.targetEndpoint ? JSON.stringify(relation.targetEndpoint) : null,
        )
      return relation
    })
  }

  updateRelation(input: UpdateRelationInput): KnowledgeRelation {
    return withKnowledgeSavepoint(this.db, () => {
      const existing = this.getRelation(input.id)
      if (!existing) throw new Error(`Relation not found: ${input.id}`)
      const sourceNode = this.getNode(existing.sourceId)
      const targetNode = this.getNode(existing.targetId)
      if (!sourceNode || !targetNode) throw new Error("Relation endpoint is missing")
      validateKnowledgeEndpoint(this.db, sourceNode, input.sourceEndpoint)
      validateKnowledgeEndpoint(this.db, targetNode, input.targetEndpoint)

      if (input.evidenceIds && input.evidenceIds.length > 0) {
        for (const eid of input.evidenceIds) {
          const anchor = this.getEvidenceAnchor(eid)
          if (!anchor) {
            throw new Error(`Evidence anchor not found: ${eid}`)
          }
        }
      }

      const updated = knowledgeRelationSchema.parse({
        ...existing,
        predicate: input.predicate ?? existing.predicate,
        reviewState: input.reviewState ?? existing.reviewState,
        evidenceIds: input.evidenceIds ?? existing.evidenceIds,
        sourceEndpoint: input.sourceEndpoint ?? existing.sourceEndpoint,
        targetEndpoint: input.targetEndpoint ?? existing.targetEndpoint,
        updatedAt: new Date().toISOString(),
      })

      this.db
        .prepare(`
      UPDATE knowledge_relations
      SET predicate = ?, review_state = ?, evidence_ids_json = ?, updated_at = ?, source_endpoint_json = ?, target_endpoint_json = ?
      WHERE id = ?
    `)
        .run(
          updated.predicate,
          updated.reviewState,
          JSON.stringify(updated.evidenceIds),
          updated.updatedAt,
          updated.sourceEndpoint ? JSON.stringify(updated.sourceEndpoint) : null,
          updated.targetEndpoint ? JSON.stringify(updated.targetEndpoint) : null,
          updated.id,
        )
      return updated
    })
  }

  getRelation(id: KnowledgeRelationId): KnowledgeRelation | null {
    const raw = this.db.prepare("SELECT * FROM knowledge_relations WHERE id = ?").get(id)
    if (!raw) return null
    return rowToRelation(relationRowSchema.parse(raw))
  }

  findRelations(filter?: RelationFilter): readonly KnowledgeRelation[] {
    let sql = "SELECT * FROM knowledge_relations WHERE 1=1"
    const params: string[] = []
    if (filter?.nodeId) {
      sql += " AND (source_id = ? OR target_id = ?)"
      params.push(filter.nodeId, filter.nodeId)
    }
    if (filter?.predicate) {
      sql += " AND predicate = ?"
      params.push(filter.predicate)
    }
    if (filter?.reviewState) {
      sql += " AND review_state = ?"
      params.push(filter.reviewState)
    }
    sql += " ORDER BY created_at ASC"
    const rawRows = this.db.prepare(sql).all(...params)
    return rawRows.map((r) => rowToRelation(relationRowSchema.parse(r)))
  }

  getBacklinks(nodeId: KnowledgeNodeId): readonly BacklinkItem[] {
    const rawRows = this.db
      .prepare("SELECT * FROM knowledge_relations WHERE target_id = ? ORDER BY created_at ASC")
      .all(nodeId)

    return rawRows.map((raw) => {
      const relation = rowToRelation(relationRowSchema.parse(raw))
      const sourceNode = this.getNode(relation.sourceId)
      if (!sourceNode) throw new Error(`Source node missing for relation ${relation.id}`)
      const evidenceAnchors: EvidenceAnchor[] = []
      for (const eid of relation.evidenceIds) {
        const anchor = this.getEvidenceAnchor(eid)
        if (anchor) evidenceAnchors.push(anchor)
      }
      return { relation, sourceNode, evidenceAnchors }
    })
  }

  getNeighbourGraph(
    nodeId: KnowledgeNodeId,
    maxDepth = 1,
    options?: NeighbourGraphOptions,
  ): NodeNeighbourGraph {
    return executeGetNeighbourGraph(this.db, nodeId, maxDepth, options)
  }
}
