import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openKnowledgeDatabase } from "../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../src/electron/knowledgeRepository"
import { documentVersionIdSchema, knowledgeNodeIdSchema } from "../../src/shared/knowledgeSchemas"
import { documentIdSchema, sha256Schema } from "../../src/shared/schemas"

describe("KnowledgeRepository", () => {
  let db: DatabaseSync
  let repo: KnowledgeRepository

  beforeEach(() => {
    db = openKnowledgeDatabase(":memory:")
    repo = new KnowledgeRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it("creates, retrieves, updates, and deletes nodes", () => {
    const node = repo.createNode({
      kind: "concept",
      title: "Self-Attention Mechanism",
      body: "Relates different positions of a single sequence to compute representation.",
      aliases: ["Scaled Dot-Product Attention"],
      metadata: { domain: "NLP" },
    })

    expect(node.id).toBeDefined()
    expect(node.kind).toBe("concept")
    expect(node.title).toBe("Self-Attention Mechanism")
    expect(node.aliases).toContain("Scaled Dot-Product Attention")

    const retrieved = repo.getNode(node.id)
    expect(retrieved).toEqual(node)

    const updated = repo.updateNode({
      id: node.id,
      title: "Scaled Self-Attention",
      aliases: ["Self-Attention", "Dot-Product Attention"],
    })
    expect(updated.title).toBe("Scaled Self-Attention")
    expect(updated.aliases).toHaveLength(2)

    const deleted = repo.deleteNode(node.id)
    expect(deleted).toBe(true)
    expect(repo.getNode(node.id)).toBeNull()
  })

  it("performs FTS5 full text search across title, body, and aliases", () => {
    repo.createNode({
      kind: "concept",
      title: "Transformers Architecture",
      body: "Neural network model relying entirely on self-attention.",
      aliases: ["Vaswani 2017"],
    })
    repo.createNode({
      kind: "claim",
      title: "FlashAttention Speedup",
      body: "IO-aware exact attention algorithm with sub-quadratic memory reads.",
      aliases: ["Dao et al."],
    })

    const attentionResults = repo.findNodes({ search: "attention" })
    expect(attentionResults.length).toBeGreaterThanOrEqual(2)

    const vaswaniResults = repo.findNodes({ search: "Vaswani" })
    expect(vaswaniResults).toHaveLength(1)
    expect(vaswaniResults[0]?.title).toBe("Transformers Architecture")

    const filtered = repo.findNodes({ search: "attention", kind: "claim" })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.title).toBe("FlashAttention Speedup")
  })

  it("manages relations, review states, and backlinks", () => {
    const paperNode = repo.createNode({
      kind: "paper",
      title: "Attention Is All You Need",
    })
    const conceptNode = repo.createNode({
      kind: "concept",
      title: "Transformer",
    })

    const relation = repo.createRelation({
      sourceId: paperNode.id,
      targetId: conceptNode.id,
      predicate: "discusses",
      provenance: { source: "user", model: null, extractorVersion: null },
      reviewState: "proposed",
    })

    expect(relation.reviewState).toBe("proposed")

    const updated = repo.updateRelation({
      id: relation.id,
      reviewState: "accepted",
    })
    expect(updated.reviewState).toBe("accepted")

    const backlinks = repo.getBacklinks(conceptNode.id)
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0]?.sourceNode.id).toBe(paperNode.id)
    expect(backlinks[0]?.relation.predicate).toBe("discusses")
  })

  it("enforces immutable document versions and connects evidence navigation", () => {
    const paperNode = repo.createNode({
      kind: "paper",
      title: "BERT: Pre-training of Deep Bidirectional Transformers",
    })

    const docVersion = repo.createDocumentVersion({
      id: documentVersionIdSchema.parse("11111111-1111-4111-8111-111111111111"),
      originalDocumentId: documentIdSchema.parse("aabbccddeeff0011"),
      paperNodeId: paperNode.id,
      hash: sha256Schema.parse("b".repeat(64)),
      metadata: { originalFilename: "bert.pdf" },
      createdAt: new Date().toISOString(),
    })

    const anchor = repo.createEvidenceAnchor({
      documentVersionId: docVersion.id,
      page: 3,
      quote: "We introduce BERT: Bidirectional Encoder Representations from Transformers",
      x: 100,
      y: 200,
      fragments: [{ x: 100, y: 200, width: 300, height: 20 }],
    })

    const nav = repo.getEvidenceNavigation(anchor.id)
    expect(nav).not.toBeNull()
    expect(nav?.originalDocumentId).toBe("aabbccddeeff0011")
    expect(nav?.hash).toBe("b".repeat(64))
    expect(nav?.page).toBe(3)
    expect(nav?.quote).toContain("We introduce BERT")
  })

  it("allows one concept in two placements on boards, and deleting placement preserves node", () => {
    const board1 = repo.createBoard("Literature Review")
    const board2 = repo.createBoard("Methodology")

    const concept = repo.createNode({
      kind: "concept",
      title: "Residual Connections",
    })

    const p1 = repo.createPlacement({
      boardId: board1.id,
      nodeId: concept.id,
      x: 50,
      y: 50,
    })
    const p2 = repo.createPlacement({
      boardId: board2.id,
      nodeId: concept.id,
      x: 200,
      y: 300,
    })

    expect(p1.nodeId).toBe(concept.id)
    expect(p2.nodeId).toBe(concept.id)

    const board1Placements = repo.findPlacementsForBoard(board1.id)
    const board2Placements = repo.findPlacementsForBoard(board2.id)
    expect(board1Placements).toHaveLength(1)
    expect(board2Placements).toHaveLength(1)

    // Deleting placement on board 1 preserves placement on board 2 and preserves the node
    const deleted = repo.deletePlacement(p1.id)
    expect(deleted).toBe(true)
    expect(repo.getPlacement(p1.id)).toBeNull()
    expect(repo.getPlacement(p2.id)).not.toBeNull()
    expect(repo.getNode(concept.id)).not.toBeNull()
  })

  it("enforces foreign key constraints: cannot create relation with invalid target", () => {
    const validNode = repo.createNode({ kind: "concept", title: "Valid" })
    const nonExistentNodeId = knowledgeNodeIdSchema.parse("99999999-9999-4999-8999-999999999999")

    expect(() => {
      repo.createRelation({
        sourceId: validNode.id,
        targetId: nonExistentNodeId,
        predicate: "relates_to",
        provenance: { source: "user", model: null, extractorVersion: null },
      })
    }).toThrow()
  })

  it("builds bounded neighbourhood graphs with depth traversal", () => {
    const n1 = repo.createNode({ kind: "concept", title: "Node 1" })
    const n2 = repo.createNode({ kind: "concept", title: "Node 2" })
    const n3 = repo.createNode({ kind: "concept", title: "Node 3" })

    repo.createRelation({
      sourceId: n1.id,
      targetId: n2.id,
      predicate: "relates_to",
      provenance: { source: "user", model: null, extractorVersion: null },
    })
    repo.createRelation({
      sourceId: n2.id,
      targetId: n3.id,
      predicate: "relates_to",
      provenance: { source: "user", model: null, extractorVersion: null },
    })

    const depth1 = repo.getNeighbourGraph(n1.id, 1)
    expect(depth1.nodes.map((n) => n.id)).toContain(n1.id)
    expect(depth1.nodes.map((n) => n.id)).toContain(n2.id)
    expect(depth1.nodes.map((n) => n.id)).not.toContain(n3.id)

    const depth2 = repo.getNeighbourGraph(n1.id, 2)
    expect(depth2.nodes.map((n) => n.id)).toContain(n3.id)
  })

  it("handles external mappings with full text review status", () => {
    const node = repo.createNode({ kind: "paper", title: "External Paper" })
    const mapping = repo.createExternalMapping({
      nodeId: node.id,
      system: "zotero",
      externalId: "item_key_1234",
      isFullTextReviewed: false,
      metadata: { collection: "LLMs" },
    })

    expect(mapping.isFullTextReviewed).toBe(false)
    const fetched = repo.getExternalMapping("zotero", "item_key_1234")
    expect(fetched).not.toBeNull()
    expect(fetched?.nodeId).toBe(node.id)
  })
})
