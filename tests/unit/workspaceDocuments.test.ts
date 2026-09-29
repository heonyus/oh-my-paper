import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

const temporaryRoots: string[] = []
const paperRowSchema = z.object({ id: z.string(), updated_at: z.string() })

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

function paper(index: number) {
  return documentRecordSchema.parse({
    id: index.toString(16).padStart(16, "0"),
    name: `paper-${index}.pdf`,
    hash: index.toString(16).padStart(64, "0"),
    bytes: 1024,
    importedAt: "2026-08-30T00:00:00.000Z",
    pageCount: 12,
    title: `Paper ${index}`,
    authors: [],
    year: null,
    doi: null,
    overview: `Overview ${index}`,
    quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
  })
}

describe("WorkspaceStore document lookups", () => {
  it("finds one document and lists all of them as the full projection does", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-documents-"))
    temporaryRoots.push(root)
    const store = new WorkspaceStore(root)
    for (let index = 1; index <= 3; index += 1) await store.addDocument(paper(index))
    const workspace = await store.read()
    await store.save({
      ...workspace,
      documents: workspace.documents.map((document) =>
        document.id === paper(2).id ? { ...document, title: "Renamed", lastReadPage: 5 } : document,
      ),
    })

    const projected = (await store.read()).documents
    expect(await store.listDocuments()).toEqual(projected)
    expect(await store.findDocument(paper(2).id)).toEqual(
      projected.find((document) => document.id === paper(2).id),
    )
    expect(await store.findDocument(paper(2).id)).toMatchObject({
      title: "Renamed",
      lastReadPage: 5,
    })
    expect(await store.findDocument(documentIdSchema.parse("ffffffffffffffff"))).toBeNull()
  })

  it("rewrites only the paper whose reading position changed", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-documents-"))
    temporaryRoots.push(root)
    const store = new WorkspaceStore(root)
    for (let index = 1; index <= 3; index += 1) await store.addDocument(paper(index))
    const updatedAt = () =>
      new Map(
        store.db
          .prepare("SELECT id, updated_at FROM knowledge_nodes WHERE kind = 'paper'")
          .all()
          .map((row) => {
            const { id, updated_at } = paperRowSchema.parse(row)
            return [id, updated_at]
          }),
      )
    const before = updatedAt()
    const workspace = await store.read()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await store.save({
      ...workspace,
      baseSnapshotToken: workspace.snapshotToken,
      documents: workspace.documents.map((document) =>
        document.id === paper(2).id ? { ...document, lastReadPage: 3 } : document,
      ),
    })

    const after = updatedAt()
    const changed = [...after].filter(([id, value]) => before.get(id) !== value)
    expect(changed).toHaveLength(1)
    expect(await store.findDocument(paper(1).id)).not.toHaveProperty("lastReadPage")
  })

  it("forgets a deleted document", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-documents-"))
    temporaryRoots.push(root)
    const store = new WorkspaceStore(root)
    await store.addDocument(paper(1))
    await store.deleteDocument(paper(1).id)

    expect(await store.findDocument(paper(1).id)).toBeNull()
    expect(await store.listDocuments()).toEqual([])
  })
})
