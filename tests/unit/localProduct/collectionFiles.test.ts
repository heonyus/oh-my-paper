// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  CollectionFiles,
  createCanonicalNoteBytes,
  initializeCollection,
} from "../../../src/electron/collectionFiles"
import { scanNoteFiles } from "../../../src/electron/collectionNoteFiles"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })),
  )
})

async function collectionRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "scourgify-collection-"))
  roots.push(root)
  await initializeCollection(root, randomUUID())
  return root
}

describe("CollectionFiles", () => {
  it("round-trips canonical Unicode Markdown bytes and keeps identity through a rename", async () => {
    const root = await collectionRoot()
    const noteId = randomUUID()
    const source = createCanonicalNoteBytes(noteId, "# 연구 노트\r\n\r\n원문  그대로  유지\r\n")
    const files = await CollectionFiles.open(root)

    const saved = await files.saveNote({
      relativePath: `notes/${noteId}-first.md`,
      bytes: source,
      expectedRevision: null,
      reason: "explicit_save",
    })
    expect(saved.kind).toBe("saved")
    await rename(
      join(root, "notes", `${noteId}-first.md`),
      join(root, "notes", `${noteId}-renamed.md`),
    )

    const scanned = await files.scanNotes()
    expect(scanned).toHaveLength(1)
    expect(scanned[0]?.noteId).toBe(noteId)
    expect(Buffer.from(scanned[0]?.bytes ?? [])).toEqual(Buffer.from(source))
    await files.close()
  })

  it("preserves unrelated frontmatter and source bytes without YAML reserialization", async () => {
    const root = await collectionRoot()
    const noteId = randomUUID()
    const source = Buffer.from(
      `---\ntitle: "Spacing: stays"\naliases: [한글, English]\nohmypaper:\n    id: ${noteId}\n    future: keep\n---\n\n-  exact  spacing\n`,
    )
    const files = await CollectionFiles.open(root)

    const saved = await files.saveNote({
      relativePath: `notes/${noteId}.md`,
      bytes: source,
      expectedRevision: null,
      reason: "explicit_save",
    })

    expect(saved.kind).toBe("saved")
    expect(await readFile(join(root, "notes", `${noteId}.md`))).toEqual(source)
    await files.close()
  })

  it("keeps both exact byte sequences when an external edit makes a save stale", async () => {
    const root = await collectionRoot()
    const noteId = randomUUID()
    const path = `notes/${noteId}.md`
    const first = createCanonicalNoteBytes(noteId, "first\n")
    const external = createCanonicalNoteBytes(noteId, "external\r\n")
    const incoming = createCanonicalNoteBytes(noteId, "incoming  \n")
    const files = await CollectionFiles.open(root)
    const saved = await files.saveNote({
      relativePath: path,
      bytes: first,
      expectedRevision: null,
      reason: "explicit_save",
    })
    if (saved.kind !== "saved") throw new Error("fixture save did not complete")
    await writeFile(join(root, path), external)

    const conflict = await files.saveNote({
      relativePath: path,
      bytes: incoming,
      expectedRevision: saved.note.revision,
      reason: "typing",
    })

    expect(conflict.kind).toBe("conflict")
    expect(await readFile(join(root, path))).toEqual(Buffer.from(external))
    if (conflict.kind !== "conflict") throw new Error("expected conflict")
    const retained = await files.history.readConflict(conflict.conflictId)
    expect(Buffer.from(retained.currentBytes ?? [])).toEqual(Buffer.from(external))
    expect(Buffer.from(retained.incomingBytes)).toEqual(Buffer.from(incoming))
    await files.close()
  })

  it("stores immutable assets under their SHA256 without rewriting equal content", async () => {
    const root = await collectionRoot()
    const files = await CollectionFiles.open(root)
    const bytes = Uint8Array.from([0, 1, 2, 255])

    const first = await files.writeAsset({ bytes, extension: "png" })
    const second = await files.writeAsset({ bytes, extension: ".png" })

    expect(first).toEqual(second)
    expect(await readFile(join(root, first.relativePath))).toEqual(Buffer.from(bytes))
    await files.close()
  })

  it("detects an external edit made after staging instead of overwriting it", async () => {
    const root = await collectionRoot()
    const noteId = randomUUID()
    const path = `notes/${noteId}.md`
    const original = createCanonicalNoteBytes(noteId, "original\n")
    const external = createCanonicalNoteBytes(noteId, "late external edit\n")
    const initial = await CollectionFiles.open(root)
    const saved = await initial.saveNote({
      relativePath: path,
      bytes: original,
      expectedRevision: null,
      reason: "explicit_save",
    })
    if (saved.kind !== "saved") throw new Error("fixture save did not complete")
    await initial.close()
    const racing = await CollectionFiles.open(root, {
      hooks: { afterPrepared: async () => writeFile(join(root, path), external) },
    })

    const result = await racing.saveNote({
      relativePath: path,
      bytes: createCanonicalNoteBytes(noteId, "incoming\n"),
      expectedRevision: saved.note.revision,
      reason: "typing",
    })

    expect(result.kind).toBe("conflict")
    expect(await readFile(join(root, path))).toEqual(Buffer.from(external))
    await racing.close()
  })

  it("rejects an oversized note with a typed scan budget error before indexing it", async () => {
    const root = await collectionRoot()
    const noteId = randomUUID()
    await writeFile(
      join(root, "notes", `${noteId}.md`),
      createCanonicalNoteBytes(noteId, `${"x".repeat(4 * 1024 * 1024 + 1)}\n`),
    )

    await expect(scanNoteFiles(root)).rejects.toMatchObject({
      name: "CollectionScanBudgetError",
      kind: "per_note_bytes",
    })
  })

  it("rejects a count-heavy collection before reading note bytes", { retry: 2 }, async () => {
    const root = await collectionRoot()
    const writeBatch = 128
    for (let start = 0; start < 4_097; start += writeBatch) {
      await Promise.all(
        Array.from({ length: Math.min(writeBatch, 4_097 - start) }, () => {
          const noteId = randomUUID()
          return writeFile(
            join(root, "notes", `${noteId}.md`),
            createCanonicalNoteBytes(noteId, "small\n"),
          )
        }),
      )
    }

    await expect(scanNoteFiles(root)).rejects.toMatchObject({
      name: "CollectionScanBudgetError",
      kind: "note_count",
    })
  })

  it("rejects an aggregate note-byte budget while each note remains individually allowed", {
    retry: 2,
  }, async () => {
    const root = await collectionRoot()
    for (let index = 0; index < 17; index += 1) {
      const noteId = randomUUID()
      await writeFile(join(root, "notes", `${noteId}.md`), Buffer.alloc(4_000_000))
    }

    await expect(scanNoteFiles(root)).rejects.toMatchObject({
      name: "CollectionScanBudgetError",
      kind: "aggregate_bytes",
    })
  })
})
