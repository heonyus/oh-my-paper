import { createHash, randomUUID } from "node:crypto"
import type { Dirent } from "node:fs"
import { lstat, mkdir, readdir, realpath, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { MAX_BACKUP_FILE_BYTES } from "../shared/backupSchemas"
import { type CollectionId, collectionManifestSchema } from "../shared/collectionSchemas"
import {
  BackupArchiveError,
  type BackupPackageReader,
  type BackupPackageWriter,
  type BackupRestoreTarget,
  type BackupSource,
  type BackupSourceEntry,
} from "./backupArchive"
import { existingPath, readBounded, reserve, safePath, type WalkBudget } from "./backupFileSafety"

async function mustBeNew(path: string): Promise<void> {
  try {
    await lstat(path)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return
    throw error
  }
  throw new BackupArchiveError("target_exists", `Refusing to overwrite: ${path}`)
}

async function canonicalDirectoryRoot(uncheckedRoot: string): Promise<string> {
  if (!isAbsolute(uncheckedRoot)) {
    throw new BackupArchiveError("unsafe_path", "Collection and backup roots must be absolute")
  }
  const metadata = await lstat(uncheckedRoot)
  if (metadata.isSymbolicLink()) {
    throw new BackupArchiveError("symlink", `Root cannot be a symlink: ${uncheckedRoot}`)
  }
  if (!metadata.isDirectory()) {
    throw new BackupArchiveError("corrupt", `Root is not a directory: ${uncheckedRoot}`)
  }
  return await realpath(uncheckedRoot)
}

async function portableFiles(
  root: string,
  prefix: string,
  budget: WalkBudget,
): Promise<readonly BackupSourceEntry[]> {
  const directory = await existingPath(root, prefix)
  let entries: readonly Dirent[] = []
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
    throw error
  }
  const files: BackupSourceEntry[] = []
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = `${prefix}/${entry.name}`
    const path = await existingPath(root, relativePath)
    if (entry.isSymbolicLink()) {
      reserve(budget, relativePath, 0)
      files.push({ relativePath, bytes: new Uint8Array(), isSymbolicLink: true })
    } else if (entry.isDirectory()) {
      files.push(...(await portableFiles(root, relativePath, budget)))
    } else if (entry.isFile()) {
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) {
        reserve(budget, relativePath, 0)
        files.push({ relativePath, bytes: new Uint8Array(), isSymbolicLink: true })
        continue
      }
      if (!metadata.isFile()) throw new BackupArchiveError("corrupt", `Not a file: ${relativePath}`)
      reserve(budget, relativePath, metadata.size)
      files.push({
        relativePath,
        bytes: await readBounded(path, metadata.size, relativePath),
        isSymbolicLink: false,
      })
    } else {
      throw new BackupArchiveError("corrupt", `Unsupported collection entry: ${relativePath}`)
    }
  }
  return files
}

async function readPortableEntry(root: string, relativePath: string): Promise<BackupSourceEntry> {
  const path = await existingPath(root, relativePath)
  const metadata = await lstat(path)
  if (metadata.isSymbolicLink()) {
    return { relativePath, bytes: new Uint8Array(), isSymbolicLink: true }
  }
  if (!metadata.isFile()) throw new BackupArchiveError("corrupt", `Not a file: ${relativePath}`)
  if (metadata.size > MAX_BACKUP_FILE_BYTES)
    throw new BackupArchiveError("size_limit", `Backup file is too large: ${relativePath}`)
  return {
    relativePath,
    bytes: await readBounded(path, metadata.size, relativePath),
    isSymbolicLink: false,
  }
}

export async function createFileBackupSource(
  uncheckedRoot: string,
  snapshotMetadata: () => Promise<Uint8Array>,
): Promise<BackupSource> {
  const root = await canonicalDirectoryRoot(uncheckedRoot)
  const manifestEntry = await readPortableEntry(root, "collection.json")
  const manifest = collectionManifestSchema.parse(
    JSON.parse(Buffer.from(manifestEntry.bytes).toString("utf8")),
  )
  let listedFingerprint: string | null = null
  const readEntries = async (): Promise<readonly BackupSourceEntry[]> => {
    const budget: WalkBudget = { entries: 1, totalBytes: manifestEntry.bytes.byteLength }
    const entries = [
      manifestEntry,
      ...(await portableFiles(root, "notes", budget)),
      ...(await portableFiles(root, "papers", budget)),
      ...(await portableFiles(root, "assets", budget)),
    ]
    listedFingerprint = fingerprint(entries)
    return entries
  }
  return {
    collectionId: manifest.collectionId,
    listEntries: readEntries,
    snapshotMetadata: async () => {
      const metadata = await snapshotMetadata()
      const beforeMetadata = listedFingerprint
      const afterMetadata = fingerprint(await readEntries())
      if (beforeMetadata !== null && beforeMetadata !== afterMetadata) {
        throw new BackupArchiveError("corrupt", "Collection changed during backup")
      }
      return metadata
    },
  }
}

function fingerprint(entries: readonly BackupSourceEntry[]): string {
  const hash = createHash("sha256")
  for (const entry of entries) {
    hash.update(entry.relativePath)
    hash.update(entry.bytes)
    hash.update(entry.isSymbolicLink ? "symlink" : "file")
  }
  return hash.digest("hex")
}

async function stageSibling(
  destinationRoot: string,
): Promise<{ readonly destination: string; readonly stage: string }> {
  if (!isAbsolute(destinationRoot))
    throw new BackupArchiveError("unsafe_path", "Destination must be absolute")
  const destination = resolve(destinationRoot)
  await mustBeNew(destination)
  await mkdir(dirname(destination), { recursive: true })
  const stage = `${destination}.tmp-${randomUUID()}`
  await mkdir(stage, { recursive: true })
  return { destination, stage }
}

export async function createDirectoryBackupWriter(
  destinationRoot: string,
): Promise<BackupPackageWriter> {
  const staged = await stageSibling(destinationRoot)
  return {
    write: async (relativePath, bytes) => {
      const path = safePath(staged.stage, relativePath)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 })
    },
    finalize: async () => {
      await rename(staged.stage, staged.destination)
    },
    discard: async () => {
      await rm(staged.stage, { recursive: true, force: true })
    },
  }
}

export async function createDirectoryBackupReader(
  backupRoot: string,
): Promise<BackupPackageReader> {
  const root = await canonicalDirectoryRoot(backupRoot)
  return {
    read: async (relativePath) => {
      const path = await existingPath(root, relativePath)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new BackupArchiveError(
          "corrupt",
          `Backup entry is not a regular file: ${relativePath}`,
        )
      }
      if (metadata.size > MAX_BACKUP_FILE_BYTES)
        throw new BackupArchiveError("size_limit", `Backup file is too large: ${relativePath}`)
      return await readBounded(path, metadata.size, relativePath)
    },
  }
}

export async function createDirectoryRestoreTarget(
  targetRoot: string,
  collectionId: CollectionId,
): Promise<BackupRestoreTarget> {
  const staged = await stageSibling(targetRoot)
  return {
    collectionId,
    write: async (relativePath, bytes) => {
      const path = safePath(staged.stage, relativePath)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 })
    },
    commit: async () => {
      await rename(staged.stage, staged.destination)
    },
    discard: async () => {
      await rm(staged.stage, { recursive: true, force: true })
    },
  }
}
