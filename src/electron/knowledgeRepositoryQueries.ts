import type { DatabaseSync } from "node:sqlite"
import type {
  EvidenceAnchor,
  EvidenceNavigationTarget,
  KnowledgeNode,
  KnowledgeNodeId,
  NeighbourGraphOptions,
  NodeFilter,
  NodeNeighbourGraph,
} from "../shared/knowledgeTypes"
import {
  anchorRowSchema,
  docVersionRowSchema,
  nodeRowSchema,
  relationRowSchema,
  rowToAnchor,
  rowToDocVersion,
  rowToNode,
  rowToRelation,
} from "./knowledgeRepositoryRows"

export function sanitizeFtsQuery(search: string): string {
  const cleaned = search
    .replace(/[":*^~+()[\]{}-]/g, " ")
    .replace(/\b(AND|OR|NOT)\b/gi, " ")
    .trim()

  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length === 0) return ""

  return tokens.map((t) => `"${t.replace(/"/g, "")}"*`).join(" ")
}

export function boundLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return 50
  return Math.min(Math.max(1, Math.floor(limit)), 100)
}

export function boundOffset(offset?: number): number {
  if (offset === undefined || Number.isNaN(offset) || offset < 0) return 0
  return Math.floor(offset)
}

export function executeFindNodes(db: DatabaseSync, filter?: NodeFilter): readonly KnowledgeNode[] {
  const limit = boundLimit(filter?.limit)
  const offset = boundOffset(filter?.offset)

  if (filter?.search) {
    const ftsQuery = sanitizeFtsQuery(filter.search)
    if (ftsQuery.length > 0) {
      const query = `
        SELECT k.* FROM knowledge_nodes k
        JOIN knowledge_nodes_fts fts ON k.id = fts.id
        WHERE knowledge_nodes_fts MATCH ?
        ${filter.kind ? "AND k.kind = ?" : ""}
        ORDER BY k.updated_at DESC
        LIMIT ? OFFSET ?
      `
      const params: (string | number)[] = [ftsQuery]
      if (filter.kind) params.push(filter.kind)
      params.push(limit, offset)
      const rawRows = db.prepare(query).all(...params)
      return rawRows.map((r) => rowToNode(nodeRowSchema.parse(r)))
    }
    return []
  }

  let sql = "SELECT * FROM knowledge_nodes WHERE 1=1"
  const params: (string | number)[] = []
  if (filter?.kind) {
    sql += " AND kind = ?"
    params.push(filter.kind)
  }
  sql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  params.push(limit, offset)

  const rawRows = db.prepare(sql).all(...params)
  return rawRows.map((r) => rowToNode(nodeRowSchema.parse(r)))
}

export function executeGetNeighbourGraph(
  db: DatabaseSync,
  nodeId: KnowledgeNodeId,
  maxDepth = 1,
  options?: NeighbourGraphOptions,
): NodeNeighbourGraph {
  const rawRoot = db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(nodeId)
  if (!rawRoot) throw new Error(`Root node not found: ${nodeId}`)
  const root = rowToNode(nodeRowSchema.parse(rawRoot))

  const maxNodes = Math.min(Math.max(1, options?.maxNodes ?? 50), 100)
  const maxEdges = Math.min(Math.max(1, options?.maxEdges ?? 50), 100)

  const visitedNodes = new Map<string, KnowledgeNode>([[root.id, root]])
  const visitedRelations = new Map<string, import("../shared/knowledgeSchemas").KnowledgeRelation>()
  const visitedEvidence = new Map<string, EvidenceAnchor>()
  let truncated = false

  let currentFrontier: KnowledgeNodeId[] = [root.id]
  const effectiveDepth = Math.min(Math.max(1, maxDepth), 3)

  for (let depth = 0; depth < effectiveDepth; depth++) {
    if (currentFrontier.length === 0) break
    if (visitedNodes.size >= maxNodes || visitedRelations.size >= maxEdges) {
      truncated = true
      break
    }

    const nextFrontier: KnowledgeNodeId[] = []

    for (const nid of currentFrontier) {
      if (visitedNodes.size >= maxNodes || visitedRelations.size >= maxEdges) {
        truncated = true
        break
      }

      const relationBudget = maxEdges - visitedRelations.size
      const rawRels = db
        .prepare("SELECT * FROM knowledge_relations WHERE source_id = ? OR target_id = ? LIMIT ?")
        .all(nid, nid, relationBudget + 1)
      if (rawRels.length > relationBudget) truncated = true

      for (const rawR of rawRels) {
        if (visitedRelations.size >= maxEdges) {
          truncated = true
          break
        }
        const rel = rowToRelation(relationRowSchema.parse(rawR))
        const otherId = rel.sourceId === nid ? rel.targetId : rel.sourceId
        if (!visitedNodes.has(otherId)) {
          const rawO = db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(otherId)
          if (!rawO) continue
          if (visitedNodes.size >= maxNodes) {
            truncated = true
            continue
          }
          const otherNode = rowToNode(nodeRowSchema.parse(rawO))
          visitedNodes.set(otherNode.id, otherNode)
          nextFrontier.push(otherNode.id)
        }
        visitedRelations.set(rel.id, rel)

        for (const eid of rel.evidenceIds) {
          const rawA = db.prepare("SELECT * FROM evidence_anchors WHERE id = ?").get(eid)
          if (rawA) {
            const anchor = rowToAnchor(anchorRowSchema.parse(rawA))
            visitedEvidence.set(anchor.id, anchor)
          }
        }
      }
    }
    currentFrontier = nextFrontier
  }

  return {
    rootNode: root,
    depth: effectiveDepth,
    nodes: [...visitedNodes.values()],
    relations: [...visitedRelations.values()],
    evidenceAnchors: [...visitedEvidence.values()],
    truncated,
  }
}

export function executeGetEvidenceNavigation(
  db: DatabaseSync,
  anchorId: string,
): EvidenceNavigationTarget | null {
  const rawA = db.prepare("SELECT * FROM evidence_anchors WHERE id = ?").get(anchorId)
  if (!rawA) return null
  const anchor = rowToAnchor(anchorRowSchema.parse(rawA))

  const rawV = db
    .prepare("SELECT * FROM document_versions WHERE id = ?")
    .get(anchor.documentVersionId)
  if (!rawV) return null
  const version = rowToDocVersion(docVersionRowSchema.parse(rawV))

  return {
    anchorId: anchor.id,
    documentVersionId: anchor.documentVersionId,
    originalDocumentId: version.originalDocumentId,
    hash: version.hash,
    page: anchor.page,
    quote: anchor.quote,
    x: anchor.x,
    y: anchor.y,
    fragments: anchor.fragments,
  }
}
