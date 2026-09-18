// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { initializeCollection } from "../../../src/electron/collectionFiles"
import { CollectionService } from "../../../src/electron/collectionService"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<{ readonly root: string; readonly indexFile: string }> {
  const root = await mkdtemp(join(tmpdir(), "scourgify-index-"))
  roots.push(root)
  await initializeCollection(root, randomUUID())
  return { root, indexFile: join(root, "machine", "index.sqlite") }
}

describe("CollectionIndex", () => {
  it("rebuilds searchable note bodies from canonical Markdown", async () => {
    const fixtureRoot = await fixture()
    let service = await CollectionService.open(fixtureRoot.root, fixtureRoot.indexFile)
    const note = await service.createNode({
      kind: "note",
      title: "항생제 메모",
      body: "외부 편집 가능한 canonical evidence",
    })
    expect(service.findNodes({ search: "canonical" }).map((node) => node.id)).toEqual([note.id])
    expect(
      service.repository.db.prepare("SELECT body FROM knowledge_nodes WHERE id = ?").get(note.id),
    ).toEqual({ body: "" })
    await service.close()

    await rm(fixtureRoot.indexFile, { force: true })
    service = await CollectionService.open(fixtureRoot.root, fixtureRoot.indexFile)
    expect(service.findNodes({ search: "evidence" }).map((node) => node.id)).toEqual([note.id])
    expect(service.index.isComplete()).toBe(true)
    await service.close()
  })

  it("keeps canonical bytes authoritative when metadata writes are attempted directly", async () => {
    const fixtureRoot = await fixture()
    const service = await CollectionService.open(fixtureRoot.root, fixtureRoot.indexFile)
    const note = await service.createNode({ kind: "note", title: "Authority", body: "file body\n" })
    const indexed = service.index.get(note.id)
    if (!indexed) throw new Error("note was not indexed")
    const before = await readFile(join(fixtureRoot.root, indexed.relativePath))

    expect(() => service.repository.updateNode({ id: note.id, body: "database body" })).toThrow(
      "CollectionService",
    )
    expect(await readFile(join(fixtureRoot.root, indexed.relativePath))).toEqual(before)
    expect(service.getNode(note.id)?.body).toBe("file body\n")
    await service.close()
  })
})
