// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  CollectionFiles,
  createCanonicalNoteBytes,
  initializeCollection,
} from "../../../src/electron/collectionFiles"
import { NoteHistory } from "../../../src/electron/noteHistory"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("NoteHistory", () => {
  it("throttles typing snapshots but preserves boundaries and exact restore bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-history-"))
    roots.push(root)
    await initializeCollection(root, randomUUID())
    let now = new Date("2026-01-01T00:00:00.000Z")
    const history = new NoteHistory(root, { now: () => now })
    const noteId = randomUUID()
    const first = createCanonicalNoteBytes(noteId, "first  \r\n")
    const second = createCanonicalNoteBytes(noteId, "second\n")

    await history.recordSnapshot({ noteId, bytes: first, reason: "typing" })
    now = new Date("2026-01-01T00:00:10.000Z")
    await history.recordSnapshot({ noteId, bytes: second, reason: "typing" })
    await history.recordSnapshot({ noteId, bytes: second, reason: "explicit_save" })

    const snapshots = await history.listSnapshots(noteId)
    expect(snapshots).toHaveLength(2)
    expect(Buffer.from(await history.readSnapshot(noteId, snapshots[1]?.snapshotId ?? ""))).toEqual(
      Buffer.from(first),
    )
  })

  it("keeps unresolved conflict evidence past 30 days and preserves pre-restore content", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-history-retention-"))
    roots.push(root)
    await initializeCollection(root, randomUUID())
    let now = new Date("2026-01-01T00:00:00.000Z")
    const files = await CollectionFiles.open(root, { now: () => now })
    const noteId = randomUUID()
    const path = `notes/${noteId}.md`
    const first = createCanonicalNoteBytes(noteId, "first\n")
    const second = createCanonicalNoteBytes(noteId, "second\n")
    const saved = await files.saveNote({
      relativePath: path,
      bytes: first,
      expectedRevision: null,
      reason: "explicit_save",
    })
    if (saved.kind !== "saved") throw new Error("fixture save did not complete")
    now = new Date("2026-01-02T00:00:00.000Z")
    const updated = await files.saveNote({
      relativePath: path,
      bytes: second,
      expectedRevision: saved.note.revision,
      reason: "restore",
    })
    if (updated.kind !== "saved") throw new Error("fixture update did not complete")
    const oldSnapshot = (await files.history.listSnapshots(noteId))[0]
    if (!oldSnapshot) throw new Error("expected pre-restore snapshot")
    const conflict = await files.history.recordConflict({
      noteId,
      relativePath: path,
      currentBytes: first,
      incomingBytes: second,
      currentRevision: saved.note.revision,
      incomingRevision: updated.note.revision,
    })
    now = new Date("2026-03-05T00:00:00.000Z")

    await files.history.prune()

    expect(await files.history.listSnapshots(noteId)).toContainEqual(oldSnapshot)
    const retained = await files.history.readConflict(conflict.conflictId)
    expect(Buffer.from(retained.currentBytes ?? [])).toEqual(Buffer.from(first))
    expect(Buffer.from(retained.incomingBytes)).toEqual(Buffer.from(second))
    await files.close()
  })

  it("prunes an unprotected snapshot only after the 30-day boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-history-prune-"))
    roots.push(root)
    await initializeCollection(root, randomUUID())
    let now = new Date("2026-01-01T00:00:00.000Z")
    const history = new NoteHistory(root, { now: () => now })
    const noteId = randomUUID()
    await history.recordSnapshot({
      noteId,
      bytes: createCanonicalNoteBytes(noteId, "old\n"),
      reason: "close",
    })
    now = new Date("2026-01-31T00:00:00.000Z")
    expect(await history.prune()).toBe(0)
    now = new Date("2026-01-31T00:00:00.001Z")

    expect(await history.prune()).toBe(1)
    expect(await history.listSnapshots(noteId)).toEqual([])
  })
})
