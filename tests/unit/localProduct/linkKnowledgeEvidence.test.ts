// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { initializeCollection } from "../../../src/electron/collectionFiles"
import { readCanonicalNoteBody } from "../../../src/electron/collectionFrontmatter"
import { CollectionService } from "../../../src/electron/collectionService"
import { linkKnowledgeEvidence } from "../../../src/electron/linkKnowledgeEvidence"
import { registerKnowledgeIpc } from "../../../src/electron/registerKnowledgeIpc"
import {
  knowledgeActionChannels,
  linkEvidenceInputSchema,
} from "../../../src/shared/knowledgeActions"
import {
  documentVersionRecordSchema,
  knowledgeNodeSchema,
} from "../../../src/shared/knowledgeSchemas"

type IpcHandler = (event: unknown, value: unknown) => unknown

const ipc = vi.hoisted(() => {
  const handlers = new Map<string, IpcHandler>()
  return {
    handlers,
    main: {
      handle: (channel: string, handler: IpcHandler): void => {
        handlers.set(channel, handler)
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel)
      },
    },
  }
})

vi.mock("electron", () => ({ ipcMain: ipc.main }))

const roots: string[] = []

afterEach(async () => {
  ipc.handlers.clear()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function openFixture(): Promise<{
  readonly collection: CollectionService
  readonly documentId: string
  readonly hash: string
}> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-link-evidence-"))
  roots.push(root)
  await initializeCollection(root, randomUUID())
  const collection = await CollectionService.open(root, join(root, "machine-index.sqlite"))
  const paper = collection.repository.createNode({ kind: "paper", title: "Synthetic source" })
  const version = collection.repository.createDocumentVersion(
    documentVersionRecordSchema.parse({
      id: randomUUID(),
      originalDocumentId: "a".repeat(16),
      paperNodeId: paper.id,
      hash: "a".repeat(64),
      metadata: { pageCount: 1 },
      createdAt: new Date().toISOString(),
    }),
  )
  return { collection, documentId: version.originalDocumentId, hash: version.hash }
}

function noteLinkInput(documentId: string, hash: string, page = 1) {
  return linkEvidenceInputSchema.parse({
    documentId,
    hash,
    anchor: { page, quote: "Synthetic evidence" },
    target: { type: "new", kind: "note", title: "Canonical evidence note" },
  })
}

describe("canonical evidence linking", () => {
  it("creates a new note through the collection when invoked by IPC", async () => {
    const fixture = await openFixture()
    try {
      const dispose = registerKnowledgeIpc(fixture.collection.repository, fixture.collection)
      const handler = ipc.handlers.get(knowledgeActionChannels.linkEvidence)
      if (!handler) throw new Error("Link evidence handler was not registered")

      const node = knowledgeNodeSchema.parse(
        await handler({}, noteLinkInput(fixture.documentId, fixture.hash)),
      )

      const indexed = fixture.collection.index.get(node.id)
      if (!indexed) throw new Error("Canonical note was not indexed")
      expect(
        readCanonicalNoteBody(
          await readFile(join(fixture.collection.collectionRoot, indexed.relativePath)),
        ),
      ).toBe("")
      expect(
        fixture.collection.repository.db
          .prepare("SELECT body FROM knowledge_nodes WHERE id = ?")
          .get(node.id),
      ).toEqual({ body: "" })
      expect(fixture.collection.repository.findRelations({ nodeId: node.id })).toHaveLength(1)
      dispose()
    } finally {
      await fixture.collection.close()
    }
  })

  it("removes a canonical note when evidence attachment rolls back", async () => {
    const fixture = await openFixture()
    try {
      const input = noteLinkInput(fixture.documentId, fixture.hash, 2)

      await expect(
        linkKnowledgeEvidence(fixture.collection.repository, input, fixture.collection),
      ).rejects.toThrow("exceeds document page count")

      expect(fixture.collection.findNodes({ kind: "note" })).toHaveLength(0)
      expect(await fixture.collection.files.scanNotes()).toHaveLength(0)
      expect(fixture.collection.repository.findRelations()).toHaveLength(0)
      expect(
        fixture.collection.repository.db
          .prepare("SELECT COUNT(*) AS count FROM evidence_anchors")
          .get(),
      ).toEqual({ count: 0 })
    } finally {
      await fixture.collection.close()
    }
  })
})
