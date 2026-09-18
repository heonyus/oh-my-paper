// @vitest-environment node
import { randomUUID } from "node:crypto"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createBackup } from "../../../src/electron/backupArchive"
import {
  createDirectoryBackupReader,
  createDirectoryBackupWriter,
  createDirectoryRestoreTarget,
  createFileBackupSource,
} from "../../../src/electron/backupFiles"
import { createLocalBackup, restoreLocalBackup } from "../../../src/electron/backupService"
import { MAX_BACKUP_FILE_BYTES } from "../../../src/shared/backupSchemas"
import { collectionIdSchema } from "../../../src/shared/collectionSchemas"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function collectionRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "scourgify-backup-"))
  roots.push(root)
  await mkdir(join(root, "notes"), { recursive: true })
  await mkdir(join(root, "papers"), { recursive: true })
  await mkdir(join(root, "assets"), { recursive: true })
  await mkdir(join(root, ".scourgify"), { recursive: true })
  await mkdir(join(root, ".scourgify", "history"), { recursive: true })
  const collectionId = randomUUID()
  await writeFile(
    join(root, "collection.json"),
    `${JSON.stringify({ format: "scourgify-collection", schemaVersion: 1, collectionId })}\n`,
  )
  await writeFile(join(root, "notes", "note.md"), "---\n---\nbackup me\n")
  await writeFile(join(root, ".scourgify", "metadata.sqlite"), "metadata")
  await writeFile(join(root, ".scourgify", "history", "old.md"), "history")
  return root
}

describe("filesystem backup adapters", () => {
  it("finalizes a sibling backup and restores into a new directory", async () => {
    const sourceRoot = await collectionRoot()
    const backupRoot = join(sourceRoot, "..", `collection-backup-${randomUUID()}`)
    const targetRoot = join(sourceRoot, "..", `collection-restored-${randomUUID()}`)
    roots.push(backupRoot, targetRoot)
    const apiBackupRoot = join(sourceRoot, "..", `collection-backup-api-${randomUUID()}`)
    roots.push(apiBackupRoot)
    const source = await createFileBackupSource(sourceRoot, async () =>
      readFile(join(sourceRoot, ".scourgify", "metadata.sqlite")),
    )
    const writer = await createDirectoryBackupWriter(backupRoot)
    const manifest = await createBackup(source, writer)
    const targetCollectionId = collectionIdSchema.parse(randomUUID())
    const restored = await restoreLocalBackup({
      backupRoot,
      targetRoot,
      targetCollectionId,
    })
    const apiResult = await createLocalBackup(sourceRoot, apiBackupRoot, async () =>
      readFile(join(sourceRoot, ".scourgify", "metadata.sqlite")),
    )

    expect(manifest.entries.map((entry) => entry.path)).not.toContain(".scourgify/history/old.md")
    expect(apiResult.entryCount).toBeGreaterThan(0)
    expect(restored.targetCollectionId).toBe(targetCollectionId)
    expect(await readFile(join(targetRoot, "notes", "note.md"))).toEqual(
      Buffer.from("---\n---\nbackup me\n"),
    )
    expect(await readFile(join(targetRoot, ".scourgify", "metadata.sqlite"))).toEqual(
      Buffer.from("metadata"),
    )
  })

  it("rejects an allowed-path symlink before writing a backup", async () => {
    const sourceRoot = await collectionRoot()
    await symlink("../outside.md", join(sourceRoot, "notes", "linked.md"))
    const source = await createFileBackupSource(sourceRoot, async () => Buffer.from("metadata"))
    const writer = await createDirectoryBackupWriter(join(sourceRoot, "..", "symlink-backup"))

    await expect(createBackup(source, writer)).rejects.toMatchObject({ kind: "symlink" })
  })

  it("refuses to stage over an existing restore directory", async () => {
    const sourceRoot = await collectionRoot()
    const targetRoot = join(sourceRoot, "existing-target")
    await mkdir(targetRoot)

    await expect(
      createDirectoryRestoreTarget(targetRoot, collectionIdSchema.parse(randomUUID())),
    ).rejects.toMatchObject({ kind: "target_exists" })
  })

  it("bounds a walking read before loading an oversized file", async () => {
    const sourceRoot = await collectionRoot()
    const oversized = join(sourceRoot, "notes", "oversized.md")
    await writeFile(oversized, "")
    await truncate(oversized, MAX_BACKUP_FILE_BYTES + 1)
    const source = await createFileBackupSource(sourceRoot, async () => Buffer.from("metadata"))

    await expect(source.listEntries()).rejects.toMatchObject({ kind: "size_limit" })
  })

  it("fails closed when collection bytes change before metadata snapshot", async () => {
    const sourceRoot = await collectionRoot()
    const destinationRoot = join(sourceRoot, "..", `changed-backup-${randomUUID()}`)
    roots.push(destinationRoot)
    const source = await createFileBackupSource(sourceRoot, async () => {
      await writeFile(join(sourceRoot, "notes", "note.md"), "---\n---\nchanged\n")
      return Buffer.from("metadata")
    })
    const writer = await createDirectoryBackupWriter(destinationRoot)

    await expect(createBackup(source, writer)).rejects.toMatchObject({ kind: "corrupt" })
    await expect(access(destinationRoot)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects a symlinked archive parent before reading its payload", async () => {
    const backupRoot = await mkdtemp(join(tmpdir(), "scourgify-backup-reader-"))
    const outside = await mkdtemp(join(tmpdir(), "scourgify-backup-reader-outside-"))
    roots.push(backupRoot, outside)
    await writeFile(join(outside, "manifest.json"), "private")
    await symlink(outside, join(backupRoot, "payload"))
    const reader = await createDirectoryBackupReader(backupRoot)

    await expect(reader.read("payload/manifest.json")).rejects.toMatchObject({ kind: "symlink" })
  })
})
