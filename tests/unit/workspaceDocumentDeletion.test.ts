// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import {
  type BoardCard,
  boardCardSchema,
  type DocumentId,
  documentIdSchema,
  documentRecordSchema,
} from "../../src/shared/schemas"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

function record(seed: string, title: string) {
  return documentRecordSchema.parse({
    id: documentIdSchema.parse(seed.repeat(16)),
    name: `${title}.pdf`,
    hash: seed.repeat(64),
    bytes: 100,
    importedAt: "2026-09-03T00:00:00.000Z",
    pageCount: 2,
    title,
    authors: [],
    year: null,
    doi: null,
    kind: "research_paper",
    overview: "",
    quality: { textCharacters: 100, needsOcr: false, warnings: [] },
  })
}

function highlight(documentId: DocumentId, id: string): BoardCard {
  return boardCardSchema.parse({
    id,
    documentId,
    kind: "highlight",
    title: "Highlight",
    body: "Marked passage",
    x: 10,
    y: 20,
    minimized: false,
    anchor: { page: 1, quote: "Marked passage", x: 0, y: 0, fragments: [] },
  })
}

async function openStore(): Promise<{ readonly root: string; readonly store: WorkspaceStore }> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-delete-document-"))
  const store = new WorkspaceStore(root)
  cleanup.push(async () => {
    await store.close()
    await rm(root, { recursive: true, force: true })
  })
  return { root, store }
}

describe("WorkspaceStore.deleteDocument", () => {
  it("removes the document with its cards, insights and versions and keeps the rest", async () => {
    const { root, store } = await openStore()
    const first = record("a", "First paper")
    const second = record("b", "Second paper")
    await store.save({
      ...defaultWorkspace(),
      documents: [first, second],
      cards: [
        highlight(first.id, "c1111111-1111-4111-8111-111111111111"),
        highlight(second.id, "c2222222-2222-4222-8222-222222222222"),
      ],
      insights: [
        {
          documentId: first.id,
          kind: "summary",
          value: "First",
          updatedAt: new Date().toISOString(),
        },
        {
          documentId: second.id,
          kind: "summary",
          value: "Second",
          updatedAt: new Date().toISOString(),
        },
      ],
      activeDocumentId: first.id,
    })

    await expect(store.deleteDocument(first.id)).resolves.toMatchObject({ id: first.id })

    const after = await store.read()
    expect(after.documents.map((document) => document.id)).toEqual([second.id])
    expect(after.cards.map((card) => card.documentId)).toEqual([second.id])
    expect(after.insights.map((insight) => insight.documentId)).toEqual([second.id])
    expect(after.activeDocumentId).toBe(second.id)
    expect(store.repository.findDocumentVersionsByDocId(first.id)).toEqual([])
    expect(store.repository.findDocumentVersionsByDocId(second.id)).toHaveLength(1)
    const projection = JSON.parse(await readFile(join(root, "workspace.json"), "utf8"))
    expect(projection.documents).toHaveLength(1)
  })

  it("reports a missing document and lets the same PDF be imported again", async () => {
    const { store } = await openStore()
    const paper = record("c", "Paper")
    await store.save({ ...defaultWorkspace(), documents: [paper] })
    await store.deleteDocument(paper.id)

    await expect(store.deleteDocument(paper.id)).resolves.toBeNull()
    await expect(store.addDocument(paper)).resolves.toMatchObject({ duplicate: false })
    expect((await store.read()).documents.map((document) => document.id)).toEqual([paper.id])
  })
})
