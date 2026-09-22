// @vitest-environment node
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createCanonicalNoteBytes,
  initializeCollection,
} from "../../../src/electron/collectionFiles"
import {
  CollectionNoteConflictError,
  CollectionService,
} from "../../../src/electron/collectionService"
import { knowledgeEndpointSchema } from "../../../src/shared/fragmentAnchors"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function openService(): Promise<{
  readonly root: string
  readonly service: CollectionService
}> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-service-"))
  roots.push(root)
  await initializeCollection(root, randomUUID())
  return { root, service: await CollectionService.open(root, join(root, "local-index.sqlite")) }
}

describe("CollectionService", () => {
  it("preserves frontmatter bytes while updating only the canonical body", async () => {
    const fixture = await openService()
    const note = await fixture.service.createNode({ kind: "note", title: "Note", body: "first\n" })
    const indexed = fixture.service.index.get(note.id)
    if (!indexed) throw new Error("note was not indexed")
    const external = Buffer.from(
      `---\ntitle: untouched\nohmypaper:\n  id: ${note.id}\ncustom:  two spaces\n---\nfirst\n`,
    )
    await writeFile(join(fixture.root, indexed.relativePath), external)
    await fixture.service.rescan()

    const updated = await fixture.service.updateNode({
      id: note.id,
      expectedBody: "first\n",
      body: "둘째  본문\r\n",
    })
    const saved = await readFile(join(fixture.root, indexed.relativePath))
    expect(updated.body).toBe("둘째  본문\r\n")
    const frontmatterLength = external.indexOf("first")
    expect(saved.subarray(0, frontmatterLength)).toEqual(external.subarray(0, frontmatterLength))
    await fixture.service.close()
  })

  it("allows an unchanged canonical body save without losing its fragment backlink", async () => {
    const fixture = await openService()
    const body = "Evidence must remain linked to its source."
    const note = await fixture.service.createNode({ kind: "note", title: "Note", body })
    const target = await fixture.service.createNode({ kind: "concept", title: "Concept" })
    const endpoint = knowledgeEndpointSchema.parse({
      kind: "note-fragment",
      anchor: {
        id: randomUUID(),
        nodeId: note.id,
        blockId: null,
        revision: createHash("sha256").update(body).digest("hex"),
        quote: body,
        prefix: "",
        suffix: "",
        from: 0,
        to: body.length,
      },
    })
    fixture.service.repository.createRelation({
      sourceId: note.id,
      targetId: target.id,
      sourceEndpoint: endpoint,
      predicate: "relates_to",
      provenance: { source: "user", model: null, extractorVersion: null },
    })

    const saved = await fixture.service.updateNode({ id: note.id, expectedBody: body, body })

    expect(saved.body).toBe(body)
    expect(fixture.service.repository.getBacklinks(target.id)[0]?.relation.sourceEndpoint).toEqual(
      endpoint,
    )
    await fixture.service.close()
  })

  it("keeps exact external bytes when expectedBody is stale and exposes degraded status", async () => {
    const fixture = await openService()
    const note = await fixture.service.createNode({ kind: "note", title: "Note", body: "first\n" })
    const indexed = fixture.service.index.get(note.id)
    if (!indexed) throw new Error("note was not indexed")
    const external = Buffer.from(`---\nohmypaper.id: ${note.id}\n---\nexternal  bytes\r\n`)
    await writeFile(join(fixture.root, indexed.relativePath), external)

    const conflict = fixture.service.updateNode({
      id: note.id,
      expectedBody: "first\n",
      body: "incoming\n",
    })
    await expect(conflict).rejects.toBeInstanceOf(CollectionNoteConflictError)
    expect(await readFile(join(fixture.root, indexed.relativePath))).toEqual(external)
    await fixture.service.rescan()
    expect(fixture.service.getNode(note.id)?.body).toBe("external  bytes\r\n")
    expect(await fixture.service.files.history.listSnapshots(note.id)).toHaveLength(1)
    expect((await fixture.service.status()).state).toBe("degraded")
    expect((await fixture.service.status()).unresolvedConflictIds).toHaveLength(1)
    const metadata = (await fixture.service.files.history.listConflicts())[0]
    if (!metadata) throw new Error("conflict evidence missing")
    const retained = await fixture.service.files.history.readConflict(metadata.conflictId)
    expect(retained.currentBytes).toEqual(external)
    expect(retained.incomingBytes).toEqual(
      Buffer.from(`---\nohmypaper.id: ${note.id}\n---\nincoming\n`),
    )
    await fixture.service.close()
  })

  it("reports an externally deleted canonical note without deleting its metadata", async () => {
    const fixture = await openService()
    const note = await fixture.service.createNode({ kind: "note", title: "Delete", body: "kept\n" })
    const indexed = fixture.service.index.get(note.id)
    if (!indexed) throw new Error("note was not indexed")
    await rm(join(fixture.root, indexed.relativePath))

    await fixture.service.rescan()

    expect((await fixture.service.status()).missingNoteIds).toEqual([note.id])
    expect(fixture.service.repository.getNode(note.id)?.title).toBe("Delete")
    expect(fixture.service.index.get(note.id)).toBeNull()
    await fixture.service.close()
  })

  it("serializes delayed rescans so an older projection cannot finish after a newer one", async () => {
    const fixture = await openService()
    const note = await fixture.service.createNode({ kind: "note", title: "Race", body: "old\n" })
    const indexed = fixture.service.index.get(note.id)
    if (!indexed) throw new Error("race fixture missing index")
    const oldNotes = await fixture.service.files.scanNotes()
    let firstStartedResolve: (() => void) | null = null
    let releaseFirstResolve: (() => void) | null = null
    const firstStarted = new Promise<void>((resolve) => {
      firstStartedResolve = resolve
    })
    const releaseFirst = new Promise<void>((resolve) => {
      releaseFirstResolve = resolve
    })
    let calls = 0
    const originalScan = fixture.service.files.scanNotes.bind(fixture.service.files)
    vi.spyOn(fixture.service.files, "scanNotes").mockImplementation(async () => {
      calls += 1
      if (calls === 1) {
        firstStartedResolve?.()
        await releaseFirst
        return oldNotes
      }
      return await originalScan()
    })

    const older = fixture.service.rescan()
    await firstStarted
    const newerBytes = createCanonicalNoteBytes(note.id, "new\n")
    await writeFile(join(fixture.root, indexed.relativePath), newerBytes)
    const newer = fixture.service.rescan()
    const releaseFirstScan = (): void => {
      if (releaseFirstResolve === null) throw new Error("first rescan did not start")
      releaseFirstResolve()
    }
    releaseFirstScan()
    await Promise.all([older, newer])

    expect(fixture.service.index.get(note.id)?.body).toBe("new\n")
    await fixture.service.close()
  })

  it("keeps the last good index and does not mark notes missing when a scan exceeds its budget", async () => {
    const fixture = await openService()
    const note = await fixture.service.createNode({ kind: "note", title: "Budget", body: "kept\n" })
    const indexed = fixture.service.index.get(note.id)
    if (!indexed) throw new Error("budget fixture missing index")
    await writeFile(
      join(fixture.root, indexed.relativePath),
      createCanonicalNoteBytes(note.id, `${"x".repeat(4 * 1024 * 1024 + 1)}\n`),
    )

    await expect(fixture.service.rescan()).rejects.toMatchObject({
      name: "CollectionFileError",
      kind: "read_failed",
    })
    expect(fixture.service.index.get(note.id)?.body).toBe("kept\n")
    await expect(fixture.service.status()).resolves.toMatchObject({
      state: "degraded",
      missingNoteIds: [],
    })
    await fixture.service.close()
  })

  it("restores a history snapshot and retains the exact pre-restore version", async () => {
    const fixture = await openService()
    const note = await fixture.service.createNode({
      kind: "note",
      title: "Restore",
      body: "first\r\n",
    })
    await fixture.service.updateNode({ id: note.id, expectedBody: "first\r\n", body: "second  \n" })
    const current = fixture.service.index.get(note.id)
    const snapshot = (await fixture.service.history.listSnapshots(note.id))[0]
    if (!current || !snapshot) throw new Error("restore fixture missing")

    await fixture.service.restore(note.id, snapshot.snapshotId, current.revision)

    expect(fixture.service.getNode(note.id)?.body).toBe("first\r\n")
    const snapshots = await fixture.service.history.listSnapshots(note.id)
    const snapshotBytes = await Promise.all(
      snapshots.map((candidate) =>
        fixture.service.history.readSnapshot(note.id, candidate.snapshotId),
      ),
    )
    expect(
      snapshotBytes.some((bytes) =>
        Buffer.from(bytes).equals(
          Buffer.from(`---\nohmypaper:\n  id: ${note.id}\n---\nsecond  \n`),
        ),
      ),
    ).toBe(true)
    await fixture.service.close()
  })
})
