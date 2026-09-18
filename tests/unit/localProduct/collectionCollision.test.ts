// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  type CollectionFileError,
  CollectionFiles,
  createCanonicalNoteBytes,
  initializeCollection,
} from "../../../src/electron/collectionFiles"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "scourgify-boundary-"))
  roots.push(path)
  await initializeCollection(path, randomUUID())
  return path
}

describe("collection filesystem boundary", () => {
  it.each([
    ["Topic.md", "topic.md"],
    ["Cafe\u0301.md", "Caf\u00e9.md"],
  ])("rejects case or Unicode-equivalent path collisions", async (existing, attempted) => {
    const collection = await root()
    const noteId = randomUUID()
    const original = createCanonicalNoteBytes(noteId, "original\n")
    await writeFile(join(collection, "notes", existing), original)
    const files = await CollectionFiles.open(collection)

    await expect(
      files.saveNote({
        relativePath: `notes/${attempted}`,
        bytes: createCanonicalNoteBytes(randomUUID(), "other\n"),
        expectedRevision: null,
        reason: "explicit_save",
      }),
    ).rejects.toMatchObject({ name: "CollectionFileError", kind: "path_collision" })
    expect(await readFile(join(collection, "notes", existing))).toEqual(Buffer.from(original))
    await files.close()
  })

  it("rejects duplicate note IDs without changing either file", async () => {
    const collection = await root()
    const noteId = randomUUID()
    const first = createCanonicalNoteBytes(noteId, "one\n")
    const second = createCanonicalNoteBytes(noteId, "two\n")
    await writeFile(join(collection, "notes", "one.md"), first)
    await writeFile(join(collection, "notes", "two.md"), second)

    await expect(CollectionFiles.open(collection)).rejects.toMatchObject({
      name: "CollectionFileError",
      kind: "duplicate_note_id",
    })
    expect(await readFile(join(collection, "notes", "one.md"))).toEqual(Buffer.from(first))
    expect(await readFile(join(collection, "notes", "two.md"))).toEqual(Buffer.from(second))
  })

  it("rejects a symlink escape and leaves the external target untouched", async () => {
    const collection = await root()
    const outside = await mkdtemp(join(tmpdir(), "scourgify-outside-"))
    roots.push(outside)
    const external = Buffer.from("private external bytes")
    await writeFile(join(outside, "outside.md"), external)
    await symlink(join(outside, "outside.md"), join(collection, "notes", "escape.md"))

    await expect(CollectionFiles.open(collection)).rejects.toMatchObject({
      name: "CollectionFileError",
      kind: "symlink_escape",
    })
    expect(await readFile(join(outside, "outside.md"))).toEqual(external)
  })

  it("rejects a future collection schema before creating app state", async () => {
    const collection = await mkdtemp(join(tmpdir(), "scourgify-future-"))
    roots.push(collection)
    await mkdir(join(collection, "notes"))
    const manifest = Buffer.from(
      JSON.stringify({
        format: "scourgify-collection",
        schemaVersion: 2,
        collectionId: randomUUID(),
      }),
    )
    await writeFile(join(collection, "collection.json"), manifest)

    await expect(CollectionFiles.open(collection)).rejects.toEqual(
      expect.objectContaining<Partial<CollectionFileError>>({
        name: "CollectionFileError",
        kind: "unsupported_schema",
      }),
    )
    expect(await readFile(join(collection, "collection.json"))).toEqual(manifest)
    await expect(
      readFile(join(collection, ".scourgify", "writer.lock", "owner.json")),
    ).rejects.toMatchObject({ code: "ENOENT" })
  })
})
