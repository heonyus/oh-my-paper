// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { initializeCollection } from "../../../src/electron/collectionFiles"
import { readCanonicalNoteBody } from "../../../src/electron/collectionFrontmatter"
import { CollectionNoteConflictError } from "../../../src/electron/collectionService"
import { defaultWorkspace, WorkspaceStore } from "../../../src/electron/workspaceStore"
import { boardCardSchema } from "../../../src/shared/schemas"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("canonical WorkspaceStore", () => {
  it("routes workspace card bodies through the collection without a database copy", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-workspace-collection-"))
    roots.push(root)
    await initializeCollection(root, randomUUID())
    const store = await WorkspaceStore.openCollection(root, join(root, "machine-index.sqlite"))
    await store.initialize()
    expect(store.collection?.collectionRoot).toBe(await realpath(root))
    const first = await store.save(defaultWorkspace())
    const card = boardCardSchema.parse({
      id: randomUUID(),
      documentId: "aabbccddeeff0011",
      kind: "note",
      title: "Canonical card",
      body: "workspace  body\r\n",
      x: 10,
      y: 20,
      width: 300,
      height: null,
      minimized: false,
      loading: false,
      chat: [],
      anchor: { page: 1, quote: "source", x: 0, y: 0, fragments: [] },
    })

    const saved = await store.save({ ...first, cards: [card] })
    expect(saved.cards[0]?.body).toBe("workspace  body\r\n")
    const indexed = store.collection?.index.list()[0]
    if (!indexed) throw new Error("workspace note was not indexed")
    expect(readCanonicalNoteBody(await readFile(join(root, indexed.relativePath)))).toBe(
      "workspace  body\r\n",
    )
    expect(store.db.prepare("SELECT body FROM knowledge_nodes WHERE kind = 'note'").get()).toEqual({
      body: "",
    })
    await store.close()
  })

  it("keeps exact external bytes when a workspace save has no renderer baseline", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-workspace-baseline-"))
    roots.push(root)
    await initializeCollection(root, randomUUID())
    const store = await WorkspaceStore.openCollection(root, join(root, "machine-index.sqlite"))
    await store.initialize()
    const card = boardCardSchema.parse({
      id: randomUUID(),
      documentId: "aabbccddeeff0022",
      kind: "note",
      title: "Canonical card",
      body: "renderer baseline\n",
      x: 10,
      y: 20,
      width: 300,
      height: null,
      minimized: false,
      loading: false,
      chat: [],
      anchor: { page: 1, quote: "source", x: 0, y: 0, fragments: [] },
    })
    const first = await store.save(defaultWorkspace())
    await store.save({ ...first, cards: [card] })
    const indexed = store.collection?.index.list()[0]
    if (!indexed) throw new Error("workspace note was not indexed")
    const external = Buffer.from(`---\nohmypaper.id: ${indexed.noteId}\n---\nexternal  bytes\r\n`)
    const notePath = join(root, indexed.relativePath)
    await writeFile(notePath, external)

    const blindSave = store.save({ ...defaultWorkspace(), cards: [card] })

    await expect(blindSave).rejects.toBeInstanceOf(CollectionNoteConflictError)
    expect(await readFile(notePath)).toEqual(external)
    await store.close()
  })
})
