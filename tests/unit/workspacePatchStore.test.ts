import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { agentThreadSchema } from "../../src/shared/agentChat"
import {
  boardCardSchema,
  documentRecordSchema,
  sha256Schema,
  type Workspace,
} from "../../src/shared/schemas"
import { WorkspaceConflictError } from "../../src/shared/workspaceMerge"
import { acknowledgedFromPatch, diffWorkspace } from "../../src/shared/workspacePatch"

type Mode = "full" | "patch"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function openStore(): Promise<WorkspaceStore> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-patch-store-"))
  roots.push(root)
  return new WorkspaceStore(root)
}

/** Saves `edited`, derived from the acknowledged `base`, the way the renderer would in `mode`. */
async function saveEdit(
  store: WorkspaceStore,
  base: Workspace,
  edited: Workspace,
  mode: Mode,
): Promise<Workspace> {
  if (mode === "full") return store.save({ ...edited, baseSnapshotToken: edited.snapshotToken })
  const token = sha256Schema.parse(base.snapshotToken)
  const result = await store.savePatch({
    baseSnapshotToken: token,
    patch: diffWorkspace(base, edited),
  })
  if (result.status !== "saved") throw new WorkspaceConflictError(result.status)
  return acknowledgedFromPatch(edited, result)
}

const byKey = <T>(items: readonly T[], keyOf: (item: T) => string): T[] =>
  [...items].sort((left, right) => keyOf(left).localeCompare(keyOf(right)))

/**
 * Workspace content without the snapshot token and note file times, in key order: two stores
 * list papers by update time, which ties within a millisecond.
 */
function comparable(workspace: Workspace) {
  const { snapshotToken: _token, documents, cards, insights, readerNotes, ...rest } = workspace
  return {
    ...rest,
    documents: byKey(documents, (item) => item.id),
    cards: byKey(cards, (item) => item.id),
    insights: byKey(insights, (item) => `${item.documentId}:${item.kind}`),
    readerNotes: readerNotes.map(({ updatedAt: _time, ...note }) => note),
  }
}

const order = (workspace: Workspace) => ({
  documents: workspace.documents.map((item) => item.id),
  cards: workspace.cards.map((item) => item.id),
})

const paper = (id: string, title: string) =>
  documentRecordSchema.parse({
    id,
    name: `${title}.pdf`,
    hash: sha256Schema.parse(id.slice(0, 1).repeat(64)),
    bytes: 100,
    importedAt: "2026-09-05T00:00:00.000Z",
    pageCount: 12,
    title,
    authors: [],
    year: null,
    doi: null,
    overview: `${title} overview`,
    quality: { textCharacters: 10, needsOcr: false, warnings: [] },
  })
const card = (id: string, documentId: string, title: string) =>
  boardCardSchema.parse({
    id,
    documentId,
    kind: "note",
    title,
    body: "Body",
    x: 10,
    y: 20,
    minimized: false,
    anchor: { page: 1, quote: "Quote", x: 1, y: 2, fragments: [] },
  })
const thread = (id: string, title: string) =>
  agentThreadSchema.parse({
    id,
    title,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    messages: [{ role: "user", content: title }],
  })
const first = paper("1111111111111111", "First")
const second = paper("2222222222222222", "Second")
const cardA = card("c1111111-1111-4111-8111-111111111111", first.id, "Card A")
const cardB = card("c2222222-2222-4222-8222-222222222222", second.id, "Card B")
const threadA = thread("a1111111-1111-4111-8111-111111111111", "Thread A")
const note = { documentId: first.id, markdown: "내 문장", updatedAt: "2026-09-05T00:00:00.000Z" }

async function seeded(store: WorkspaceStore): Promise<Workspace> {
  return store.save({
    ...defaultWorkspace(),
    documents: [first, second],
    cards: [cardA, cardB],
    agentThreads: [threadA],
    readerNotes: [note],
  })
}

const turnPage = (workspace: Workspace, page: number): Workspace => ({
  ...workspace,
  documents: workspace.documents.map((document) =>
    document.id === first.id ? { ...document, lastReadPage: page } : document,
  ),
})

async function everydayEdits(mode: Mode) {
  const store = await openStore()
  const steps: readonly ((workspace: Workspace) => Workspace)[] = [
    (workspace) => turnPage(workspace, 4),
    (workspace) => ({
      ...workspace,
      cards: workspace.cards.map((item) => (item.id === cardA.id ? { ...item, x: 400 } : item)),
    }),
    (workspace) => ({
      ...workspace,
      readerNotes: [{ ...note, markdown: "고친 문장", updatedAt: "2026-09-06T00:00:00.000Z" }],
    }),
    (workspace) => ({ ...workspace, theme: "dark", sidebarOpen: false }),
    (workspace) => ({
      ...workspace,
      agentThreads: [
        thread("b2222222-2222-4222-8222-222222222222", "B"),
        ...workspace.agentThreads,
      ],
    }),
    (workspace) => ({
      ...workspace,
      cards: workspace.cards.filter((item) => item.id !== cardB.id),
    }),
  ]
  let acknowledged = await seeded(store)
  for (const step of steps)
    acknowledged = await saveEdit(store, acknowledged, step(acknowledged), mode)
  const persisted = await store.read()
  await store.close()
  return {
    acknowledged: comparable(acknowledged),
    persisted: comparable(persisted),
    acknowledgedOrder: order(acknowledged),
    persistedOrder: order(persisted),
  }
}

async function concurrentKnowledgeEdits(mode: Mode) {
  const store = await openStore()
  const base = await seeded(store)
  const node = store.repository.findNodes({ search: "Card A" })[0]
  const placement = store.repository
    .findPlacementsForBoard(store.repository.getOrCreateDefaultBoard().id)
    .find((candidate) => candidate.cardId === cardA.id)
  if (!node || !placement) throw new Error("Expected card A in the repository")
  store.repository.updateNode({ id: node.id, title: "Knowledge edit" })
  store.repository.updatePlacement({ id: placement.id, x: 900 })
  store.db
    .prepare(
      "INSERT INTO document_insights (document_id, kind, value, updated_at) VALUES (?, ?, ?, ?)",
    )
    .run(first.id, "summary", "Knowledge insight", "2026-09-06T00:00:00.000Z")
  const renamed = {
    ...base,
    cards: base.cards.map((item) => (item.id === cardA.id ? { ...item, title: "Reader" } : item)),
  }
  const conflict = await saveEdit(store, base, renamed, mode).then(
    () => "saved",
    (error: unknown) => (error instanceof WorkspaceConflictError ? "conflict" : "failed"),
  )
  const panned = await saveEdit(
    store,
    base,
    { ...base, viewport: { x: 80, y: 90, zoom: 1.1 } },
    mode,
  )
  const imported = paper("3333333333333333", "Imported")
  await store.addDocument(imported)
  const turned = await saveEdit(store, panned, turnPage(panned, 7), mode)
  const newer = { ...note, markdown: "새 노트" }
  const stale = await store.save({ ...(await store.read()), readerNotes: [newer] })
  await saveEdit(store, turned, { ...turned, sidebarOpen: false }, mode)
  const persisted = await store.read()
  await store.close()
  return { conflict, stale: stale.readerNotes.length, persisted: comparable(persisted) }
}

describe("WorkspaceStore.savePatch", () => {
  it("persists everyday edits exactly as full saves do and rebuilds the same acknowledgement", async () => {
    const full = await everydayEdits("full")
    const patched = await everydayEdits("patch")

    expect(patched.persisted).toEqual(full.persisted)
    expect(patched.acknowledged).toEqual(patched.persisted)
    expect(patched.acknowledgedOrder).toEqual(patched.persistedOrder)
    expect(full.acknowledged).toEqual(full.persisted)
    expect(patched.persisted.documents.find((item) => item.id === first.id)?.lastReadPage).toBe(4)
    expect(patched.persisted.agentThreads.map((item) => item.title)).toEqual(["B", "Thread A"])
    expect(patched.persisted.readerNotes.map((item) => item.markdown)).toEqual(["고친 문장"])
  })

  it("merges concurrent repository, import and note edits exactly as full saves do", async () => {
    const full = await concurrentKnowledgeEdits("full")
    const patched = await concurrentKnowledgeEdits("patch")

    expect(patched).toEqual(full)
    expect(patched.conflict).toBe("conflict")
    const persisted = patched.persisted
    expect(persisted.cards.find((item) => item.id === cardA.id)).toMatchObject({
      title: "Knowledge edit",
      x: 900,
    })
    expect(persisted.insights.map((item) => item.value)).toEqual(["Knowledge insight"])
    expect(persisted.documents.map((item) => item.id)).toContain("3333333333333333")
    expect(persisted.documents.find((item) => item.id === first.id)?.lastReadPage).toBe(7)
    expect(persisted.readerNotes.map((item) => item.markdown)).toEqual(["새 노트"])
    expect(persisted.sidebarOpen).toBe(false)
  })

  it("keeps agent threads that acknowledged snapshots do not carry", async () => {
    const store = await openStore()
    const acknowledged = await seeded(store)
    await saveEdit(store, acknowledged, turnPage(acknowledged, 2), "patch")

    expect((await store.read()).agentThreads.map((item) => item.id)).toEqual([threadA.id])
    await store.close()
  })

  it("answers a conflict for a snapshot it does not remember, including after a restart", async () => {
    const store = await openStore()
    const acknowledged = await seeded(store)
    const token = sha256Schema.parse(acknowledged.snapshotToken)
    const patch = diffWorkspace(acknowledged, turnPage(acknowledged, 3))

    await expect(
      store.savePatch({ baseSnapshotToken: sha256Schema.parse("f".repeat(64)), patch }),
    ).resolves.toEqual({ status: "conflict" })
    await store.close()
    const restarted = new WorkspaceStore(store.root)
    await expect(restarted.savePatch({ baseSnapshotToken: token, patch })).resolves.toEqual({
      status: "conflict",
    })
    expect((await restarted.read()).documents[0]?.lastReadPage).toBeUndefined()
    await restarted.close()
  })

  it("merges two writers that patch from the same base", async () => {
    const store = await openStore()
    const base = await seeded(store)
    await saveEdit(store, base, turnPage(base, 5), "patch")
    const moved = {
      ...base,
      cards: base.cards.map((item) => (item.id === cardB.id ? { ...item, y: 640 } : item)),
    }
    const second = await saveEdit(store, base, moved, "patch")

    expect(second.documents.find((item) => item.id === first.id)?.lastReadPage).toBe(5)
    expect(second.cards.find((item) => item.id === cardB.id)?.y).toBe(640)
    expect(comparable(second)).toEqual(comparable(await store.read()))
    await store.close()
  })
})
