// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { initializeCollection } from "../../../src/electron/collectionFiles"
import type { CollectionChangeEvent } from "../../../src/electron/collectionService"
import { CollectionService } from "../../../src/electron/collectionService"
import { CollectionWatcher } from "../../../src/electron/collectionWatcher"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function nextChange(service: CollectionService): Promise<CollectionChangeEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("watch event timeout")), 2_000)
    const unsubscribe = service.subscribe((event) => {
      clearTimeout(timeout)
      unsubscribe()
      resolve(event)
    })
  })
}

describe("CollectionWatcher", () => {
  it("emits changed note IDs after watcher reconciliation", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-watch-"))
    roots.push(root)
    await initializeCollection(root, randomUUID())
    const service = await CollectionService.open(root, join(root, "index.sqlite"))
    const note = await service.createNode({ kind: "note", title: "Watched", body: "before\n" })
    const indexed = service.index.get(note.id)
    if (!indexed) throw new Error("note was not indexed")

    const changed = nextChange(service)
    const watcher = CollectionWatcher.start(service, () => undefined, 20)
    const externalTemporary = join(root, "notes", ".external-save.tmp")
    await writeFile(externalTemporary, `---\nohmypaper.id: ${note.id}\n---\nafter external save\n`)
    await rename(externalTemporary, join(root, indexed.relativePath))
    await watcher.manualRescan()

    await expect(changed).resolves.toMatchObject({
      kind: "notes_reconciled",
      changedNoteIds: [note.id],
      removedNoteIds: [],
    })
    expect(service.getNode(note.id)?.body).toBe("after external save\n")
    const renamed = nextChange(service)
    const renamedPath = `notes/${note.id}-renamed.md`
    await rename(join(root, indexed.relativePath), join(root, renamedPath))
    await watcher.manualRescan()
    await expect(renamed).resolves.toMatchObject({ changedNoteIds: [note.id] })
    expect(service.index.get(note.id)?.relativePath).toBe(renamedPath)
    await watcher.close()
    await service.close()
  })
})
