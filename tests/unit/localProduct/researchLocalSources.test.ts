// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it, vi } from "vitest"
import { createLocalResearchReader } from "../../../src/electron/applicationResearchSources"
import {
  createCanonicalNoteBytes,
  initializeCollection,
} from "../../../src/electron/collectionFiles"
import { WorkspaceStore } from "../../../src/electron/workspaceStore"

it("reads the selected canonical file, bounds its excerpt, and never invents PDF content", async () => {
  const root = await mkdtemp(join(tmpdir(), "scourgify-research-local-"))
  await initializeCollection(root, randomUUID())
  const store = await WorkspaceStore.openCollection(root, join(root, "index.sqlite"))
  try {
    await store.initialize()
    const collection = store.collectionService
    if (!collection) throw new Error("Collection unavailable")
    const note = await collection.createNode({ kind: "note", title: "Selected note", body: "old" })
    const paper = await collection.createNode({
      kind: "paper",
      title: "Metadata only",
      body: "not PDF evidence",
    })
    const indexed = collection.index.get(note.id)
    if (!indexed) throw new Error("Index unavailable")
    const changed = `external source\n${"x".repeat(21_000)}`
    await writeFile(join(root, indexed.relativePath), createCanonicalNoteBytes(note.id, changed))
    const request = vi.fn(async () => {
      throw new Error("No PDF should be read")
    })
    const read = createLocalResearchReader(store, collection, { request })
    const source = await read(note.id, new AbortController().signal)
    expect(source.access).toBe("local_excerpt")
    expect(source.content).toBe(changed.slice(0, 20_000))
    expect(source.url).toBe(`scourgify://node/${note.id}`)
    expect(await read(paper.id, new AbortController().signal)).toMatchObject({
      access: "metadata_only",
      content: null,
      contentHash: null,
    })
    expect(request).not.toHaveBeenCalled()
    const abort = new AbortController()
    abort.abort()
    await expect(read(note.id, abort.signal)).rejects.toMatchObject({ name: "AbortError" })
  } finally {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})
