// @vitest-environment node
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  BackupArchiveError,
  type BackupPackageReader,
  type BackupPackageWriter,
  type BackupRestoreTarget,
  type BackupSource,
  createBackup,
  restoreBackup,
} from "../../../src/electron/backupArchive"
import { collectionManifestSchema } from "../../../src/shared/collectionSchemas"

type MemoryPackage = Map<string, Uint8Array>

function packageWriter(files: MemoryPackage): BackupPackageWriter {
  return {
    write: async (path, bytes) => {
      files.set(path, bytes)
    },
    finalize: async () => undefined,
    discard: async () => undefined,
  }
}

function packageReader(files: MemoryPackage): BackupPackageReader {
  return {
    read: async (path) => {
      const bytes = files.get(path)
      if (!bytes) throw new Error(`missing ${path}`)
      return bytes
    },
  }
}

function restoreTarget(files: MemoryPackage, collectionId: string): BackupRestoreTarget {
  return {
    collectionId: collectionManifestSchema.shape.collectionId.parse(collectionId),
    write: async (path, bytes) => {
      files.set(path, bytes)
    },
    commit: async () => undefined,
    discard: async () => undefined,
  }
}

function source(
  collectionId: string,
  entries: BackupSource["listEntries"] extends () => Promise<infer T> ? T : never,
): BackupSource {
  return {
    collectionId: collectionManifestSchema.shape.collectionId.parse(collectionId),
    listEntries: async () => entries,
    snapshotMetadata: async () => Buffer.from("sqlite-snapshot"),
  }
}

describe("backup archive", () => {
  it("creates and restores a verified new collection while omitting history", async () => {
    const sourceId = randomUUID()
    const targetId = randomUUID()
    const collection = Buffer.from(
      `${JSON.stringify({ format: "scourgify-collection", schemaVersion: 1, collectionId: sourceId })}\n`,
    )
    const backup = new Map<string, Uint8Array>()
    await createBackup(
      source(sourceId, [
        { relativePath: "collection.json", bytes: collection, isSymbolicLink: false },
        {
          relativePath: "notes/note.md",
          bytes: Buffer.from("---\n---\nhello\n"),
          isSymbolicLink: false,
        },
        {
          relativePath: ".ohmypaper/history/private.md",
          bytes: Buffer.from("must not ship"),
          isSymbolicLink: false,
        },
      ]),
      packageWriter(backup),
      () => new Date("2026-09-06T00:00:00.000Z"),
    )

    const restored = new Map<string, Uint8Array>()
    const result = await restoreBackup(packageReader(backup), restoreTarget(restored, targetId))

    expect(result.sourceCollectionId).toBe(sourceId)
    expect(result.targetCollectionId).toBe(targetId)
    expect(restored.has(".ohmypaper/history/private.md")).toBe(false)
    expect(restored.get("notes/note.md")).toEqual(Buffer.from("---\n---\nhello\n"))
    expect(
      JSON.parse(Buffer.from(restored.get("collection.json") ?? []).toString()).collectionId,
    ).toBe(targetId)
  })

  it("rejects tampered payloads before committing the new target", async () => {
    const sourceId = randomUUID()
    const backup = new Map<string, Uint8Array>()
    const collection = Buffer.from(
      `${JSON.stringify({ format: "scourgify-collection", schemaVersion: 1, collectionId: sourceId })}\n`,
    )
    await createBackup(
      source(sourceId, [
        { relativePath: "collection.json", bytes: collection, isSymbolicLink: false },
      ]),
      packageWriter(backup),
    )
    backup.set("payload/collection.json", Buffer.from("tampered"))
    const target = restoreTarget(new Map(), randomUUID())

    await expect(restoreBackup(packageReader(backup), target)).rejects.toBeInstanceOf(
      BackupArchiveError,
    )
  })

  it.each(["../escape.md", "notes/../../escape.md", "notes\\escape.md"])(
    "rejects unsafe source path %s",
    async (relativePath) => {
      const sourceId = randomUUID()
      const collection = Buffer.from(
        `${JSON.stringify({ format: "scourgify-collection", schemaVersion: 1, collectionId: sourceId })}\n`,
      )
      await expect(
        createBackup(
          source(sourceId, [
            { relativePath: "collection.json", bytes: collection, isSymbolicLink: false },
            { relativePath, bytes: Buffer.from("bad"), isSymbolicLink: false },
          ]),
          packageWriter(new Map()),
        ),
      ).rejects.toBeInstanceOf(BackupArchiveError)
    },
  )

  it("rejects symlink entries even when their path is portable", async () => {
    const sourceId = randomUUID()
    const collection = Buffer.from(
      `${JSON.stringify({ format: "scourgify-collection", schemaVersion: 1, collectionId: sourceId })}\n`,
    )
    await expect(
      createBackup(
        source(sourceId, [
          { relativePath: "collection.json", bytes: collection, isSymbolicLink: false },
          { relativePath: "papers/source.pdf", bytes: Buffer.from("link"), isSymbolicLink: true },
        ]),
        packageWriter(new Map()),
      ),
    ).rejects.toBeInstanceOf(BackupArchiveError)
  })
})
