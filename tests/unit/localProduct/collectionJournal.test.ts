// @vitest-environment node
import { randomUUID } from "node:crypto"
import { chmod, mkdtemp, readFile, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  CollectionFiles,
  createCanonicalNoteBytes,
  initializeCollection,
} from "../../../src/electron/collectionFiles"
import { CollectionService } from "../../../src/electron/collectionService"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "ohmypaper-journal-"))
  roots.push(path)
  await initializeCollection(path, randomUUID())
  return path
}

describe("collection journal", () => {
  it("finishes a flushed interrupted save on restart and requests metadata acknowledgement", async () => {
    const collection = await root()
    const noteId = randomUUID()
    const path = `notes/${noteId}.md`
    const incoming = createCanonicalNoteBytes(noteId, "recover me\n")
    const crashing = await CollectionFiles.open(collection, {
      hooks: {
        afterPrepared: async () => {
          throw new Error("simulated crash")
        },
      },
    })

    await expect(
      crashing.saveNote({
        relativePath: path,
        bytes: incoming,
        expectedRevision: null,
        reason: "explicit_save",
      }),
    ).rejects.toMatchObject({ name: "CollectionFileError", kind: "write_failed" })
    await crashing.close()

    const restarted = await CollectionFiles.open(collection)
    const recovery = await restarted.recover()
    expect(recovery).toHaveLength(1)
    expect(recovery[0]?.kind).toBe("metadata_pending")
    expect(await readFile(join(collection, path))).toEqual(Buffer.from(incoming))
    if (recovery[0]?.kind !== "metadata_pending") throw new Error("missing recovery")
    await restarted.acknowledgeRecovery(recovery[0].operationId)
    expect(await restarted.recover()).toEqual([])
    await restarted.close()
  })

  it("keeps the committed note when metadata acknowledgement fails", async () => {
    const collection = await root()
    const noteId = randomUUID()
    const path = `notes/${noteId}.md`
    const incoming = createCanonicalNoteBytes(noteId, "filesystem committed\n")
    const files = await CollectionFiles.open(collection)

    const result = await files.saveNote({
      relativePath: path,
      bytes: incoming,
      expectedRevision: null,
      reason: "explicit_save",
      acknowledge: async () => {
        throw new Error("database unavailable")
      },
    })

    expect(result.kind).toBe("metadata_pending")
    expect(await readFile(join(collection, path))).toEqual(Buffer.from(incoming))
    expect((await files.recover())[0]?.kind).toBe("metadata_pending")
    await files.close()
  })

  it("promotes a renamed prepared entry during initialization after state persistence fails", async () => {
    const collection = await root()
    const noteId = randomUUID()
    const path = `notes/${noteId}.md`
    const incoming = createCanonicalNoteBytes(noteId, "promote me\n")
    const crashing = await CollectionFiles.open(collection, {
      hooks: {
        afterPrepared: async () => {
          throw new Error("simulated state write failure")
        },
      },
    })

    await expect(
      crashing.saveNote({
        relativePath: path,
        bytes: incoming,
        expectedRevision: null,
        reason: "explicit_save",
      }),
    ).rejects.toMatchObject({ name: "CollectionFileError", kind: "write_failed" })
    await crashing.close()

    const pending = await CollectionFiles.open(collection)
    const entry = (await pending.journal.entries())[0]
    if (!entry) throw new Error("prepared journal entry missing")
    await rename(
      join(collection, entry.temporaryRelativePath),
      join(collection, entry.relativePath),
    )
    await pending.close()

    const service = await CollectionService.open(collection, join(collection, "index.sqlite"))
    expect(await service.files.journal.entries()).toEqual([])
    await service.close()
  })

  // Windows ignores the read-only mode on a directory, so the write would succeed there.
  it.skipIf(process.platform === "win32")(
    "preserves the last committed bytes when the note directory is read-only",
    async () => {
      const collection = await root()
      const noteId = randomUUID()
      const path = `notes/${noteId}.md`
      const oldBytes = createCanonicalNoteBytes(noteId, "old bytes\n")
      const files = await CollectionFiles.open(collection)
      const saved = await files.saveNote({
        relativePath: path,
        bytes: oldBytes,
        expectedRevision: null,
        reason: "explicit_save",
      })
      if (saved.kind !== "saved") throw new Error("fixture save did not complete")
      await chmod(join(collection, "notes"), 0o500)

      try {
        await expect(
          files.saveNote({
            relativePath: path,
            bytes: createCanonicalNoteBytes(noteId, "must not replace\n"),
            expectedRevision: saved.note.revision,
            reason: "explicit_save",
          }),
        ).rejects.toMatchObject({ name: "CollectionFileError", kind: "write_failed" })
        expect(await readFile(join(collection, path))).toEqual(Buffer.from(oldBytes))
        expect(Buffer.from((await files.history.readRecoveryDraft(noteId)) ?? [])).toEqual(
          Buffer.from(createCanonicalNoteBytes(noteId, "must not replace\n")),
        )
      } finally {
        await chmod(join(collection, "notes"), 0o700)
        await files.close()
      }
    },
  )

  it("rejects a second app writer", async () => {
    const collection = await root()
    const first = await CollectionFiles.open(collection)

    await expect(CollectionFiles.open(collection)).rejects.toMatchObject({
      name: "CollectionFileError",
      kind: "writer_locked",
    })
    await first.close()
  })
})
