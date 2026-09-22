import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentVersionIdSchema } from "../../src/shared/knowledgeSchemas"
import { documentIdSchema, sha256Schema } from "../../src/shared/schemas"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("Knowledge Storage & Migration", () => {
  it("migrates legacy workspace.json transactionally with backup and does not re-import on repeat open", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-kmig-"))
    temporaryRoots.push(root)

    const legacy = {
      documents: [
        {
          id: "aabbccddeeff0011",
          name: "sample.pdf",
          hash: "a".repeat(64),
          bytes: 2048,
          importedAt: "2026-08-30T00:00:00.000Z",
          pageCount: 5,
          title: "Sample Paper Title",
          authors: ["Alice", "Bob"],
          year: 2024,
          doi: "10.1234/sample",
          kind: "research_paper",
          overview: "A test paper overview",
          quality: { textCharacters: 500, needsOcr: false, warnings: [] },
        },
      ],
      cards: [
        {
          id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
          documentId: "aabbccddeeff0011",
          kind: "note",
          title: "Card Note",
          body: "Note body content",
          x: 100,
          y: 200,
          minimized: false,
          anchor: { page: 2, quote: "sample quote", x: 50, y: 80 },
        },
      ],
      insights: [
        {
          documentId: "aabbccddeeff0011",
          kind: "keywords",
          value: "machine learning, transformers",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
      sidebarOpen: false,
      outlineWidth: 260,
      researchSidebarWidth: 320,
      uiFontFamily: "pretendard",
      uiFontScale: 1.1,
      theme: "dark",
      minimapVisible: false,
      viewport: { x: 120, y: 45, zoom: 1.1 },
      activeDocumentId: "aabbccddeeff0011",
    }
    await writeFile(join(root, "workspace.json"), JSON.stringify(legacy), "utf8")

    const store1 = new WorkspaceStore(root)
    const readWs = await store1.read()

    // Assert migration preserved all attributes
    expect(readWs.documents).toHaveLength(1)
    expect(readWs.documents[0]?.title).toBe("Sample Paper Title")
    expect(readWs.cards).toHaveLength(1)
    expect(readWs.cards[0]?.title).toBe("Card Note")
    expect(readWs.cards[0]?.anchor.quote).toBe("sample quote")
    expect(readWs.insights).toHaveLength(1)
    expect(readWs.insights[0]?.value).toContain("machine learning")
    expect(readWs.sidebarOpen).toBe(false)
    expect(readWs.theme).toBe("dark")
    expect(readWs.uiFontFamily).toBe("pretendard")

    // Assert backup file created
    const files = await readdir(root)
    const backup = files.find((f) => f.startsWith("workspace.json.backup-"))
    expect(backup).toBeDefined()

    // DB has the canonical nodes
    const paperNodes = store1.repository.findNodes({ kind: "paper" })
    expect(paperNodes).toHaveLength(1)
    expect(paperNodes[0]?.title).toBe("Sample Paper Title")

    // Update in DB
    const firstNode = paperNodes[0]
    if (!firstNode) throw new Error("Expected paper node to exist")
    store1.repository.updateNode({
      id: firstNode.id,
      title: "Modified Paper In DB",
    })

    // Open second store instance: verify DB is source of truth, not stale workspace.json
    const store2 = new WorkspaceStore(root)
    const readWs2 = await store2.read()
    expect(readWs2.documents[0]?.title).toBe("Modified Paper In DB")
  })

  it("handles corrupt workspace.json cleanly without corrupting the store", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-corrupt-"))
    temporaryRoots.push(root)

    await writeFile(join(root, "workspace.json"), "{ corrupt json !!", "utf8")

    const store = new WorkspaceStore(root)
    await expect(store.read()).rejects.toThrow("Failed to parse corrupt legacy workspace JSON")

    // Old file remains untouched
    const content = await readFile(join(root, "workspace.json"), "utf8")
    expect(content).toBe("{ corrupt json !!")
  })

  it("ensures source version immutability and anchor stability", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-version-"))
    temporaryRoots.push(root)

    const store = new WorkspaceStore(root)
    const paperNode = store.repository.createNode({
      kind: "paper",
      title: "Document Version Test",
    })

    const version1 = store.repository.createDocumentVersion({
      id: documentVersionIdSchema.parse("22222222-2222-4222-8222-222222222222"),
      originalDocumentId: documentIdSchema.parse("1122334455667788"),
      paperNodeId: paperNode.id,
      hash: sha256Schema.parse("c".repeat(64)),
      metadata: { edition: "v1" },
      createdAt: new Date().toISOString(),
    })

    const version2 = store.repository.createDocumentVersion({
      id: documentVersionIdSchema.parse("33333333-3333-4333-8333-333333333333"),
      originalDocumentId: documentIdSchema.parse("1122334455667788"),
      paperNodeId: paperNode.id,
      hash: sha256Schema.parse("d".repeat(64)),
      metadata: { edition: "v2" },
      createdAt: new Date().toISOString(),
    })

    const anchor1 = store.repository.createEvidenceAnchor({
      documentVersionId: version1.id,
      page: 1,
      quote: "Original version text",
    })

    const nav = store.repository.getEvidenceNavigation(anchor1.id)
    expect(nav?.hash).toBe("c".repeat(64))
    expect(nav?.documentVersionId).toBe(version1.id)
    // Anchor remains anchored to version 1 even though version 2 exists
    expect(nav?.documentVersionId).not.toBe(version2.id)
  })

  it("preserves knowledge nodes when placements are removed from boards", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-placements-"))
    temporaryRoots.push(root)

    const store = new WorkspaceStore(root)
    const boardA = store.repository.createBoard("Board A")
    const boardB = store.repository.createBoard("Board B")

    const concept = store.repository.createNode({
      kind: "concept",
      title: "Shared Concept",
      body: "Single source of truth body",
    })

    const pA = store.repository.createPlacement({
      boardId: boardA.id,
      nodeId: concept.id,
      x: 10,
      y: 20,
    })
    const pB = store.repository.createPlacement({
      boardId: boardB.id,
      nodeId: concept.id,
      x: 300,
      y: 400,
    })

    // Edit node content
    store.repository.updateNode({
      id: concept.id,
      body: "Updated single source of truth body",
    })

    // Delete placement A
    store.repository.deletePlacement(pA.id)

    expect(store.repository.getPlacement(pA.id)).toBeNull()
    expect(store.repository.getPlacement(pB.id)).not.toBeNull()

    // Concept node still exists with updated body
    const fetched = store.repository.getNode(concept.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.body).toBe("Updated single source of truth body")
  })
})
