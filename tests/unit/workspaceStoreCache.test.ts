// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { initializeCollection } from "../../src/electron/collectionFiles"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { agentThreadSchema } from "../../src/shared/agentChat"
import {
  boardCardSchema,
  type DocumentRecord,
  documentRecordSchema,
} from "../../src/shared/schemas"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-store-cache-"))
  roots.push(root)
  return root
}

function paper(index: number): DocumentRecord {
  return documentRecordSchema.parse({
    id: (index + 1).toString(16).padStart(16, "0"),
    name: `paper-${index}.pdf`,
    hash: (index + 1).toString(16).padStart(64, "0"),
    bytes: 100,
    importedAt: "2026-09-01T00:00:00.000Z",
    pageCount: 9,
    title: `Paper ${index}`,
    authors: [],
    year: null,
    doi: null,
    overview: `Overview ${index}`,
    quality: { textCharacters: 1, needsOcr: false, warnings: [] },
  })
}

function card(document: DocumentRecord, body = "Card body") {
  return boardCardSchema.parse({
    id: randomUUID(),
    documentId: document.id,
    kind: "note",
    title: "Card",
    body,
    x: 10,
    y: 20,
    minimized: false,
    anchor: { page: 1, quote: "Quote", x: 1, y: 2, fragments: [] },
  })
}

/** Each paper node's last update time, by node id. */
function paperUpdates(store: WorkspaceStore): ReadonlyMap<string, string> {
  const rows = store.db.prepare("SELECT id, updated_at FROM knowledge_nodes WHERE kind = 'paper'")
  return new Map(
    rows.all().map((raw) => {
      const row = z.object({ id: z.string(), updated_at: z.string() }).parse(raw)
      return [row.id, row.updated_at]
    }),
  )
}

const thread = agentThreadSchema.parse({
  id: "0f8d7c6b-5a49-4382-9170-6e5d4c3b2a19",
  title: "Thread",
  messages: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
})

describe("WorkspaceStore caching", () => {
  it("serves one frozen workspace until this or another connection writes", async () => {
    const store = new WorkspaceStore(await temporaryRoot())
    await store.addDocument(paper(1))
    const first = await store.read()

    expect(await store.read()).toBe(first)
    expect(Object.isFrozen(first) && Object.isFrozen(first.documents)).toBe(true)
    expect(() => {
      Reflect.apply(Array.prototype.push, first.documents, [paper(2)])
    }).toThrow(TypeError)

    store.db.prepare("UPDATE workspace_settings SET outline_width = 300").run()
    const second = await store.read()
    expect(second).not.toBe(first)
    expect(second.outlineWidth).toBe(300)

    const other = new DatabaseSync(store.databaseFile)
    other.prepare("UPDATE workspace_settings SET outline_width = 333").run()
    other.close()
    expect((await store.read()).outlineWidth).toBe(333)
    await store.close()
  })

  it("rereads reader notes and agent threads edited outside the store", async () => {
    const root = await temporaryRoot()
    const store = new WorkspaceStore(root)
    const document = paper(1)
    await store.addDocument(document)
    expect((await store.read()).readerNotes).toEqual([])

    await mkdir(join(root, "reader-notes"), { recursive: true })
    await writeFile(join(root, "reader-notes", `${document.id}.md`), "first words")
    expect((await store.read()).readerNotes.map((note) => note.markdown)).toEqual(["first words"])
    await writeFile(join(root, "reader-notes", `${document.id}.md`), "second words, longer")
    expect((await store.read()).readerNotes.map((note) => note.markdown)).toEqual([
      "second words, longer",
    ])

    await writeFile(join(root, "agent-threads.json"), JSON.stringify({ threads: [thread] }))
    expect((await store.read()).agentThreads).toEqual([thread])
    await store.close()
  })

  it("rewrites the agent threads file only when the threads change", async () => {
    const root = await temporaryRoot()
    const store = new WorkspaceStore(root)
    const saved = await store.save({ ...defaultWorkspace(), agentThreads: [thread] })
    const file = join(root, "agent-threads.json")
    const written = await stat(file)

    await store.save({ ...saved, viewport: { x: 1, y: 2, zoom: 1 } })
    const unchanged = await stat(file)
    expect([unchanged.ino, unchanged.mtimeMs]).toEqual([written.ino, written.mtimeMs])

    await store.save({ ...saved, agentThreads: [{ ...thread, title: "Renamed" }] })
    expect(JSON.parse(await readFile(file, "utf8")).threads[0].title).toBe("Renamed")
    await store.close()
  })

  it("leaves papers untouched when a save changes a card or another paper", async () => {
    const store = new WorkspaceStore(await temporaryRoot())
    for (let index = 0; index < 3; index += 1) await store.addDocument(paper(index))
    const initial = await store.read()
    let latest = await store.save({ ...initial, cards: [card(paper(0))] })
    const before = paperUpdates(store)

    latest = await store.save({
      ...latest,
      cards: latest.cards.map((item) => ({ ...item, x: item.x + 50 })),
    })
    expect(paperUpdates(store)).toEqual(before)
    expect(latest.cards[0]?.x).toBe(60)

    const target = paper(1).id
    latest = await store.save({
      ...latest,
      documents: latest.documents.map((item) =>
        item.id === target ? { ...item, lastReadPage: 4 } : item,
      ),
    })
    const after = paperUpdates(store)
    const changedNodes = [...after].filter(([id, updatedAt]) => before.get(id) !== updatedAt)
    expect(changedNodes).toHaveLength(1)
    expect(latest.documents.find((item) => item.id === target)?.lastReadPage).toBe(4)
    await store.close()
  })

  it("shows a collection note edited outside the app on the next read", async () => {
    const root = await temporaryRoot()
    await initializeCollection(root, randomUUID())
    const store = await WorkspaceStore.openCollection(root, join(root, "machine-index.sqlite"))
    await store.initialize()
    const first = await store.save(defaultWorkspace())
    await store.save({ ...first, cards: [card(paper(1), "inside the app\n")] })
    expect((await store.read()).cards[0]?.body).toBe("inside the app\n")

    const indexed = store.collection?.index.list()[0]
    if (!indexed) throw new Error("Expected an indexed note")
    await writeFile(
      join(root, indexed.relativePath),
      `---\nohmypaper.id: ${indexed.noteId}\n---\nedited elsewhere\n`,
    )
    expect((await store.read()).cards[0]?.body).toBe("edited elsewhere\n")
    await store.close()
  })
})

describe("WorkspaceStore.addDocument", () => {
  it("adds one document as the active one and mirrors it to disk on close", async () => {
    const root = await temporaryRoot()
    const store = new WorkspaceStore(root)
    const before = await store.save(defaultWorkspace())
    const added = await store.addDocument(paper(1))

    expect(added).toEqual({ document: paper(1), duplicate: false })
    const current = await store.read()
    expect(current.revision).toBe((before.revision ?? 0) + 1)
    expect(current.activeDocumentId).toBe(paper(1).id)
    expect(current.documents).toEqual([paper(1)])

    await store.save({ ...current, documents: [{ ...paper(1), title: "Renamed" }] })
    const duplicate = await store.addDocument({ ...paper(1), id: paper(9).id })
    expect(duplicate).toEqual({ document: { ...paper(1), title: "Renamed" }, duplicate: true })

    await store.addDocument(paper(2))
    await store.close()
    const mirror = JSON.parse(await readFile(join(root, "workspace.json"), "utf8"))
    expect(mirror.documents.map((document: DocumentRecord) => document.id)).toContain(paper(2).id)
  })

  it("adds a document to a collection library", async () => {
    const root = await temporaryRoot()
    await initializeCollection(root, randomUUID())
    const store = await WorkspaceStore.openCollection(root, join(root, "machine-index.sqlite"))
    await store.initialize()

    await store.addDocument(paper(1))
    expect((await store.read()).documents).toEqual([paper(1)])
    expect(await store.findDocument(paper(1).id)).toEqual(paper(1))
    await store.close()
  })
})
