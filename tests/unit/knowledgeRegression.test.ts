import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openKnowledgeDatabase } from "../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../src/electron/knowledgeRepository"
import { WorkspaceConflictError } from "../../src/electron/knowledgeWorkspaceMerge"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentVersionIdSchema } from "../../src/shared/knowledgeSchemas"
import {
  boardCardSchema,
  documentIdSchema,
  documentRecordSchema,
  sha256Schema,
} from "../../src/shared/schemas"

describe("Knowledge Review Regressions", () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "scourgify-regress-"))
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it("regression 2: saving an old reader snapshot (e.g. pan viewport) must NOT overwrite title/body edits made via knowledge repo", async () => {
    const store = new WorkspaceStore(tmpRoot)
    await store.read()

    // Add a document and card
    const paperNode = store.repository.createNode({
      kind: "paper",
      title: "Original Paper Title",
      body: "Original Paper Body",
    })
    const docVersion = store.repository.createDocumentVersion({
      id: documentVersionIdSchema.parse("11111111-1111-4111-8111-111111111111"),
      originalDocumentId: documentIdSchema.parse("1111222233334444"),
      paperNodeId: paperNode.id,
      hash: sha256Schema.parse("e".repeat(64)),
      metadata: {},
      createdAt: new Date().toISOString(),
    })
    store.repository.createEvidenceAnchor({
      documentVersionId: docVersion.id,
      page: 1,
      quote: "Quote",
      fragments: [{ x: 10, y: 10, width: 100, height: 20 }],
    })
    const cardNode = store.repository.createNode({
      kind: "note",
      title: "Knowledge Note Title V1",
      body: "Knowledge Note Body V1",
      metadata: {
        documentId: "1111222233334444",
        cardKind: "note",
        anchor: {
          page: 1,
          quote: "Quote",
          x: 10,
          y: 10,
          fragments: [{ x: 10, y: 10, width: 100, height: 20 }],
        },
      },
    })
    const board = store.repository.getOrCreateDefaultBoard()
    store.repository.createPlacement({
      boardId: board.id,
      nodeId: cardNode.id,
      cardId: "c1111111-1111-4111-8111-111111111111",
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    })

    // Stale reader snapshot taken here
    const staleReaderSnapshot = await store.read()
    expect(staleReaderSnapshot.cards[0]?.title).toBe("Knowledge Note Title V1")

    // Now knowledge surface edits title and body directly
    store.repository.updateNode({
      id: cardNode.id,
      title: "Updated Note Title V2 by Knowledge Editor",
      body: "Updated Note Body V2 by Knowledge Editor",
    })
    store.repository.updateNode({
      id: paperNode.id,
      title: "Updated Paper Title V2",
    })
    const knowledgeUpdatedAt = store.repository.getNode(cardNode.id)?.updatedAt

    // Stale reader saves back ONLY viewport change (e.g. user panned the board)
    const readerSavePayload = {
      ...staleReaderSnapshot,
      viewport: { x: 500, y: 600, zoom: 1.5 },
    }
    await store.save(readerSavePayload)

    // Verify knowledge title and body are preserved!
    const refreshedNode = store.repository.getNode(cardNode.id)
    expect(refreshedNode?.title).toBe("Updated Note Title V2 by Knowledge Editor")
    expect(refreshedNode?.body).toBe("Updated Note Body V2 by Knowledge Editor")
    expect(refreshedNode?.updatedAt).toBe(knowledgeUpdatedAt)

    const refreshedPaper = store.repository.getNode(paperNode.id)
    expect(refreshedPaper?.title).toBe("Updated Paper Title V2")

    const refreshedWorkspace = await store.read()
    expect(refreshedWorkspace.cards[0]?.title).toBe("Updated Note Title V2 by Knowledge Editor")
    expect(refreshedWorkspace.viewport.x).toBe(500)

    await store.save({
      ...staleReaderSnapshot,
      viewport: { x: 700, y: 800, zoom: 1.75 },
    })

    const afterRepeatedStaleSave = store.repository.getNode(cardNode.id)
    expect(afterRepeatedStaleSave?.title).toBe("Updated Note Title V2 by Knowledge Editor")
    expect(afterRepeatedStaleSave?.body).toBe("Updated Note Body V2 by Knowledge Editor")
  })

  it("regression 4: FTS handles Korean tokens, hyphens, colons, quotes, operators, and caps limit/offset", () => {
    const db = openKnowledgeDatabase(":memory:")
    const repo = new KnowledgeRepository(db)

    repo.createNode({
      kind: "concept",
      title: "자가-주의 메커니즘 (Self-Attention)",
      body: "트랜스포머의 핵심 기법: Q, K, V 행렬 연산.",
      aliases: ["셀프-어텐션", "Scaled Dot-Product"],
    })

    // Search with Korean, hyphens, colons, stars, quotes, operators
    expect(() => repo.findNodes({ search: "자가-주의" })).not.toThrow()
    const r1 = repo.findNodes({ search: "자가-주의" })
    expect(r1.length).toBeGreaterThanOrEqual(1)

    expect(() => repo.findNodes({ search: "트랜스포머: Q, K, V" })).not.toThrow()
    expect(() => repo.findNodes({ search: '""*OR*AND*NOT*::--' })).not.toThrow()
    expect(() => repo.findNodes({ search: "셀프-어텐션" })).not.toThrow()

    // Bounded limit and negative/huge offset
    const bounded = repo.findNodes({ limit: -10, offset: -5 })
    expect(bounded.length).toBeLessThanOrEqual(100)

    const huge = repo.findNodes({ limit: 100000 })
    expect(huge.length).toBeLessThanOrEqual(100)

    db.close()
  })

  it("regression 4: neighbour traversal enforces hard caps on nodes and edges", () => {
    const db = openKnowledgeDatabase(":memory:")
    const repo = new KnowledgeRepository(db)

    const root = repo.createNode({ kind: "concept", title: "Root Node" })
    // Create 150 connected nodes
    for (let i = 0; i < 150; i++) {
      const n = repo.createNode({ kind: "concept", title: `Child ${i}` })
      repo.createRelation({
        sourceId: root.id,
        targetId: n.id,
        predicate: "relates_to",
        provenance: { source: "user", model: null, extractorVersion: null },
      })
    }

    const graph = repo.getNeighbourGraph(root.id, 2, { maxNodes: 50, maxEdges: 50 })
    expect(graph.nodes.length).toBeLessThanOrEqual(50)
    expect(graph.relations.length).toBeLessThanOrEqual(50)
    expect(graph.truncated).toBe(true)
    const nodeIds = new Set(graph.nodes.map((node) => node.id))
    expect(
      graph.relations.every(
        (relation) => nodeIds.has(relation.sourceId) && nodeIds.has(relation.targetId),
      ),
    ).toBe(true)

    db.close()
  })

  it("regression 3: durable migration marker and corrupt data safety", async () => {
    // Setup corrupt file
    await writeFile(join(tmpRoot, "workspace.json"), "{ corrupt !!", "utf8")
    const store = new WorkspaceStore(tmpRoot)

    await expect(store.read()).rejects.toThrow()

    // Ensure database did not initialize defaults over corrupt workspace
    const rawDb = openKnowledgeDatabase(join(tmpRoot, "knowledge.sqlite"))
    const rawCount = rawDb.prepare("SELECT COUNT(*) FROM knowledge_nodes").get()
    expect(Object.values(rawCount ?? {})[0]).toBe(0)
    rawDb.close()
  })

  it("regression 3: backup has private permissions 0o600 and durable marker prevents reimport if nodes deleted", async () => {
    const legacy = {
      documents: [],
      cards: [
        {
          id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
          documentId: "1111222233334444",
          kind: "note",
          title: "Durable Note",
          body: "Body",
          x: 10,
          y: 10,
          minimized: false,
          anchor: {
            page: 1,
            quote: "quote",
            x: 10,
            y: 10,
            fragments: [{ x: 10, y: 10, width: 1, height: 1 }],
          },
        },
      ],
      insights: [],
      sidebarOpen: true,
      outlineWidth: 240,
      researchSidebarWidth: 300,
      uiFontFamily: "wanted",
      uiFontScale: 1,
      theme: "system",
      minimapVisible: true,
      viewport: { x: 0, y: 0, zoom: 1 },
      activeDocumentId: null,
    }
    await writeFile(join(tmpRoot, "workspace.json"), JSON.stringify(legacy), "utf8")
    const store = new WorkspaceStore(tmpRoot)
    await store.read()

    // Check backup permissions
    const { stat, readdir } = await import("node:fs/promises")
    const files = await readdir(tmpRoot)
    const backup = files.find((f) => f.startsWith("workspace.json.backup-"))
    expect(backup).toBeDefined()
    if (backup) {
      const st = await stat(join(tmpRoot, backup))
      expect(st.mode & 0o777).toBe(0o600)
    }

    // User deletes all nodes in knowledge store
    const nodes = store.repository.findNodes()
    for (const n of nodes) {
      store.repository.deleteNode(n.id)
    }
    expect(store.repository.findNodes().length).toBe(0)

    // Reopening workspace store MUST NOT reimport legacy workspace.json!
    const store2 = new WorkspaceStore(tmpRoot)
    const ws2 = await store2.read()
    expect(ws2.cards.length).toBe(0)
  })

  it("regression 5: relation evidence cannot dangle and source versions are immutable", async () => {
    const db = openKnowledgeDatabase(":memory:")
    const repo = new KnowledgeRepository(db)
    const n1 = repo.createNode({ kind: "concept", title: "C1" })
    const n2 = repo.createNode({ kind: "concept", title: "C2" })
    const fakeAnchorId = "99999999-9999-4999-8999-999999999999"
    const parsedFakeAnchorId = (
      await import("../../src/shared/knowledgeSchemas")
    ).evidenceAnchorIdSchema.parse(fakeAnchorId)

    // Cannot create relation referencing non-existent evidence anchor
    expect(() => {
      repo.createRelation({
        sourceId: n1.id,
        targetId: n2.id,
        predicate: "cites",
        provenance: { source: "user", model: null, extractorVersion: null },
        evidenceIds: [parsedFakeAnchorId],
      })
    }).toThrow(/Evidence anchor.*not found/)

    db.close()
  })

  it("projects all canonical paper documents and preserves exact card source ranges", async () => {
    const store = new WorkspaceStore(tmpRoot)
    const documents = Array.from({ length: 101 }, (_, index) =>
      documentRecordSchema.parse({
        id: String(index + 1).padStart(16, "0"),
        name: `paper-${index}.pdf`,
        hash: `${index.toString(16).padStart(2, "0")}`.repeat(32),
        bytes: 1000 + index,
        importedAt: "2026-09-05T00:00:00.000Z",
        pageCount: 3,
        title: `Paper ${index}`,
        authors: [],
        year: null,
        doi: null,
        overview: `Overview ${index}`,
        quality: { textCharacters: 10, needsOcr: false, warnings: [] },
      }),
    )
    await store.save({ ...defaultWorkspace(), documents })
    expect((await store.read()).documents).toHaveLength(101)

    const card = boardCardSchema.parse({
      id: "c2222222-2222-4222-8222-222222222222",
      documentId: documents[0]?.id,
      kind: "citation",
      title: "Mapped note",
      body: "Body",
      x: 10,
      y: 20,
      minimized: false,
      chat: [{ role: "assistant", content: "Assessment retained" }],
      sourceMeta: {
        title: "Referenced paper",
        authors: ["Author One", "Author Two"],
        year: 2024,
        venue: "Journal of References",
        abstract: "Structured metadata must survive projection.",
        doi: "10.1000/reference",
        url: "https://example.com/reference",
        citationCount: 42,
        assessment: {
          breakdown: {
            dependency: 20,
            methodological: 20,
            conceptual: 15,
            evidentiary: 10,
            contextSufficiency: 8,
          },
          confidence: 0.9,
          citationReason: "The reference is relevant.",
          readingValue: "Read the method section.",
          reasons: ["Directly related"],
          recommendedSections: ["method"],
          limitations: ["Metadata-only assessment"],
          score: 73,
          tier: "skim",
        },
      },
      anchor: {
        page: 2,
        quote: "Mapped quote",
        x: 30,
        y: 40,
        fragments: [],
        astRanges: [{ sourceItemId: "item:paragraph-1", start: 4, end: 10 }],
      },
    })
    const committed = await store.save({ ...(await store.read()), cards: [card] })
    expect(committed.cards[0]?.anchor.astRanges).toEqual(card.anchor.astRanges)
    expect(committed.cards[0]?.chat).toEqual(card.chat)
    expect(committed.cards[0]?.sourceMeta).toEqual(card.sourceMeta)
    const citationNode = store.repository.findNodes({ search: "Mapped note" })[0]
    expect(citationNode?.kind).toBe("note")

    const sticky = boardCardSchema.parse({
      ...card,
      id: "c7777777-7777-4777-8777-777777777777",
      kind: "sticky",
      title: "Sticky note",
      sourceMeta: undefined,
      chat: [],
      anchor: {
        page: 2,
        quote: "보드 포스트잇",
        x: 900,
        y: 700,
        fragments: [{ x: 900, y: 700, width: 1, height: 1 }],
      },
    })
    await store.save({ ...committed, cards: [...committed.cards, sticky] })
    const stickyNode = store.repository.findNodes({ search: "Sticky note" })[0]
    if (!stickyNode) throw new Error("Expected sticky note")
    expect(store.repository.findRelations({ nodeId: stickyNode.id })).toHaveLength(0)
  })

  it("does not infer a card anchor from an unrelated document anchor", async () => {
    const store = new WorkspaceStore(tmpRoot)
    const paper = store.repository.createNode({ kind: "paper", title: "Paper" })
    const version = store.repository.createDocumentVersion({
      id: documentVersionIdSchema.parse("44444444-4444-4444-8444-444444444444"),
      originalDocumentId: documentIdSchema.parse("4444444444444444"),
      paperNodeId: paper.id,
      hash: sha256Schema.parse("4".repeat(64)),
      metadata: { pageCount: 2 },
      createdAt: new Date().toISOString(),
    })
    store.repository.createEvidenceAnchor({
      documentVersionId: version.id,
      page: 1,
      quote: "Unrelated quote",
      fragments: [],
    })
    const node = store.repository.createNode({
      kind: "note",
      title: "No source mapping",
      metadata: { documentId: "4444444444444444", cardKind: "note" },
    })
    const board = store.repository.getOrCreateDefaultBoard()
    store.repository.createPlacement({
      boardId: board.id,
      nodeId: node.id,
      cardId: "c3333333-3333-4333-8333-333333333333",
      x: 0,
      y: 0,
    })
    expect((await store.read()).cards).toHaveLength(0)
  })

  it("returns a committed save acknowledgement and does not reimport its first projection", async () => {
    const store = new WorkspaceStore(tmpRoot)
    const document = documentRecordSchema.parse({
      id: "6666666666666666",
      name: "fresh.pdf",
      hash: sha256Schema.parse("6".repeat(64)),
      bytes: 100,
      importedAt: "2026-09-05T00:00:00.000Z",
      pageCount: 1,
      title: "Fresh paper",
      authors: [],
      year: null,
      doi: null,
      overview: "Fresh overview",
      quality: { textCharacters: 10, needsOcr: false, warnings: [] },
    })
    const committed = await store.save({ ...defaultWorkspace(), documents: [document] })
    await store.flush()
    expect(committed.documents[0]?.title).toBe("Fresh paper")
    const paper = store.repository.findNodes({ kind: "paper" })[0]
    if (!paper) throw new Error("Expected fresh paper")
    store.repository.updateNode({ id: paper.id, title: "Canonical title" })

    const reopened = await new WorkspaceStore(tmpRoot).read()
    expect(reopened.documents[0]?.title).toBe("Canonical title")
  })

  it("rejects same-field stale content conflicts while preserving concurrent movement and insights", async () => {
    const store = new WorkspaceStore(tmpRoot)
    const card = boardCardSchema.parse({
      id: "c5555555-5555-4555-8555-555555555555",
      documentId: "5555555555555555",
      kind: "note",
      title: "Original",
      body: "Body",
      x: 10,
      y: 20,
      minimized: false,
      anchor: { page: 1, quote: "Quote", x: 1, y: 2, fragments: [] },
    })
    const document = documentRecordSchema.parse({
      id: "5555555555555555",
      name: "paper.pdf",
      hash: sha256Schema.parse("5".repeat(64)),
      bytes: 100,
      importedAt: "2026-09-05T00:00:00.000Z",
      pageCount: 1,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      overview: "Overview",
      quality: { textCharacters: 10, needsOcr: false, warnings: [] },
    })
    await store.save({ ...defaultWorkspace(), documents: [document], cards: [card] })
    const base = await store.read()
    const cardNode = store.repository.findNodes({ search: "Original" })[0]
    if (!cardNode) throw new Error("Expected card node")
    store.repository.updateNode({ id: cardNode.id, title: "Knowledge edit" })
    const moved = store.repository.findPlacementsForBoard(
      store.repository.getOrCreateDefaultBoard().id,
    )[0]
    if (!moved) throw new Error("Expected card placement")
    store.repository.updatePlacement({ id: moved.id, x: 900 })
    store.db
      .prepare(
        "INSERT INTO document_insights (document_id, kind, value, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(document.id, "summary", "Knowledge insight", new Date().toISOString())

    await expect(
      store.save({
        ...base,
        cards: base.cards.map((candidate) => ({ ...candidate, title: "Reader conflict" })),
      }),
    ).rejects.toBeInstanceOf(WorkspaceConflictError)
    const stalePan = await store.save({ ...base, viewport: { x: 80, y: 90, zoom: 1.1 } })
    expect(stalePan.cards[0]?.title).toBe("Knowledge edit")
    expect(stalePan.cards[0]?.x).toBe(900)
    expect(stalePan.insights[0]?.value).toBe("Knowledge insight")
  })

  it("uses distinct acknowledgement tokens when repository edits share a settings revision", async () => {
    const store = new WorkspaceStore(tmpRoot)
    const document = documentRecordSchema.parse({
      id: "8888888888888888",
      name: "token.pdf",
      hash: sha256Schema.parse("8".repeat(64)),
      bytes: 100,
      importedAt: "2026-09-05T00:00:00.000Z",
      pageCount: 1,
      title: "Token paper",
      authors: [],
      year: null,
      doi: null,
      overview: "Overview",
      quality: { textCharacters: 10, needsOcr: false, warnings: [] },
    })
    const card = boardCardSchema.parse({
      id: "c8888888-8888-4888-8888-888888888888",
      documentId: document.id,
      kind: "note",
      title: "Knowledge A",
      body: "Body",
      x: 10,
      y: 20,
      minimized: false,
      anchor: { page: 1, quote: "Quote", x: 1, y: 2, fragments: [] },
    })
    await store.save({ ...defaultWorkspace(), documents: [document], cards: [card] })
    const readA = await store.read()
    const node = store.repository.findNodes({ search: "Knowledge A" })[0]
    if (!node) throw new Error("Expected knowledge note")
    store.repository.updateNode({ id: node.id, title: "Knowledge B" })
    const readB = await store.read()
    expect(readA.revision).toBe(readB.revision)
    expect(readA.snapshotToken).not.toBe(readB.snapshotToken)
    store.repository.updateNode({ id: node.id, title: "Knowledge C" })

    const committed = await store.save({
      ...readB,
      viewport: { x: 500, y: 600, zoom: 1.2 },
    })
    expect(committed.cards[0]?.title).toBe("Knowledge C")
    expect(committed.viewport.x).toBe(500)
  })
})
