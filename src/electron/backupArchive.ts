import { createHash } from "node:crypto"
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  type BackupManifest,
  backupManifestSchema,
  MAX_BACKUP_FILE_BYTES,
} from "../shared/backupSchemas"
import {
  type CollectionId,
  collectionManifestSchema,
  collectionRelativePathSchema,
} from "../shared/collectionSchemas"

const MANIFEST_PATH = "manifest.json"
const COLLECTION_MANIFEST_PATH = "collection.json"
const METADATA_PATH = ".scourgify/metadata.sqlite"

export type BackupSourceEntry = {
  readonly relativePath: string
  readonly bytes: Uint8Array
  readonly isSymbolicLink: boolean
}

export type BackupSource = {
  readonly collectionId: CollectionId
  readonly listEntries: () => Promise<readonly BackupSourceEntry[]>
  readonly snapshotMetadata: () => Promise<Uint8Array>
}

export type BackupPackageWriter = {
  readonly write: (relativePath: string, bytes: Uint8Array) => Promise<void>
  readonly finalize: () => Promise<void>
  readonly discard: () => Promise<void>
}

export type BackupPackageReader = {
  readonly read: (relativePath: string) => Promise<Uint8Array>
}

export type BackupRestoreTarget = {
  readonly collectionId: CollectionId
  readonly write: (relativePath: string, bytes: Uint8Array) => Promise<void>
  readonly commit: () => Promise<void>
  readonly discard: () => Promise<void>
}

export class BackupArchiveError extends Error {
  readonly name = "BackupArchiveError"

  constructor(
    readonly kind:
      | "corrupt"
      | "duplicate"
      | "invalid_manifest"
      | "size_limit"
      | "symlink"
      | "unsafe_path"
      | "unsupported_path"
      | "same_collection"
      | "target_exists",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function parseManifest(bytes: Uint8Array): BackupManifest {
  try {
    return backupManifestSchema.parse(JSON.parse(Buffer.from(bytes).toString("utf8")))
  } catch (error) {
    throw new BackupArchiveError("invalid_manifest", "Backup manifest is invalid", { cause: error })
  }
}

function portablePath(uncheckedPath: string): string {
  try {
    return collectionRelativePathSchema.parse(uncheckedPath)
  } catch (error) {
    throw new BackupArchiveError("unsafe_path", `Unsafe collection path: ${uncheckedPath}`, {
      cause: error,
    })
  }
}

function isPortablePath(path: string): boolean {
  return (
    path === COLLECTION_MANIFEST_PATH ||
    path === METADATA_PATH ||
    path.startsWith("notes/") ||
    path.startsWith("papers/") ||
    path.startsWith("assets/")
  )
}

function validateEntry(path: string, bytes: Uint8Array): void {
  if (!isPortablePath(path))
    throw new BackupArchiveError("unsupported_path", `Excluded path: ${path}`)
  if (bytes.byteLength > MAX_BACKUP_FILE_BYTES) {
    throw new BackupArchiveError("size_limit", `Backup file is too large: ${path}`)
  }
}

function backupBytes(manifest: BackupManifest): Uint8Array {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
}

export async function createBackup(
  source: BackupSource,
  writer: BackupPackageWriter,
  now: () => Date = () => new Date(),
): Promise<BackupManifest> {
  try {
    const seen = new Set<string>()
    const entries: { readonly path: string; readonly bytes: Uint8Array }[] = []
    const sourceEntries = await source.listEntries()
    for (const entry of sourceEntries) {
      if (entry.isSymbolicLink) {
        throw new BackupArchiveError(
          "symlink",
          `Symlink cannot enter a backup: ${entry.relativePath}`,
        )
      }
      const path = portablePath(entry.relativePath)
      if (!isPortablePath(path)) continue
      validateEntry(path, entry.bytes)
      if (seen.has(path)) throw new BackupArchiveError("duplicate", `Duplicate path: ${path}`)
      seen.add(path)
      entries.push({ path, bytes: entry.bytes })
    }

    const metadata = await source.snapshotMetadata()
    if (!seen.has(METADATA_PATH)) {
      validateEntry(METADATA_PATH, metadata)
      seen.add(METADATA_PATH)
      entries.push({ path: METADATA_PATH, bytes: metadata })
    }
    const collection = entries.find((entry) => entry.path === COLLECTION_MANIFEST_PATH)
    if (!collection) throw new BackupArchiveError("corrupt", "Collection manifest is missing")
    const collectionManifest = collectionManifestSchema.parse(
      JSON.parse(Buffer.from(collection.bytes).toString("utf8")),
    )
    if (collectionManifest.collectionId !== source.collectionId) {
      throw new BackupArchiveError("corrupt", "Collection identity does not match the source")
    }
    const manifest = backupManifestSchema.parse({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      sourceCollectionId: source.collectionId,
      createdAt: now().toISOString(),
      entries: entries.map(({ path, bytes }) => ({
        path,
        size: bytes.byteLength,
        sha256: sha256(bytes),
      })),
      excluded: ["credentials", "cache", "history", "journal", "recovery", "conflicts"],
    })
    await writer.write(MANIFEST_PATH, backupBytes(manifest))
    for (const entry of entries) await writer.write(`payload/${entry.path}`, entry.bytes)
    await writer.finalize()
    return manifest
  } catch (error) {
    await writer.discard()
    throw error
  }
}

export async function restoreBackup(
  reader: BackupPackageReader,
  target: BackupRestoreTarget,
): Promise<{
  readonly sourceCollectionId: CollectionId
  readonly targetCollectionId: CollectionId
  readonly entryCount: number
  readonly totalBytes: number
}> {
  try {
    const manifest = parseManifest(await reader.read(MANIFEST_PATH))
    if (manifest.sourceCollectionId === target.collectionId) {
      throw new BackupArchiveError("same_collection", "Restore target must be a new collection")
    }
    const collectionEntry = manifest.entries.find(
      (entry) => entry.path === COLLECTION_MANIFEST_PATH,
    )
    if (!collectionEntry) throw new BackupArchiveError("corrupt", "Collection manifest is missing")
    for (const entry of manifest.entries) {
      const path = portablePath(entry.path)
      if (!isPortablePath(path))
        throw new BackupArchiveError("unsupported_path", `Excluded path: ${path}`)
      const bytes = await reader.read(`payload/${path}`)
      if (bytes.byteLength !== entry.size || sha256(bytes) !== entry.sha256) {
        throw new BackupArchiveError("corrupt", `Backup hash mismatch: ${path}`)
      }
      if (path === COLLECTION_MANIFEST_PATH) {
        const original = collectionManifestSchema.parse(
          JSON.parse(Buffer.from(bytes).toString("utf8")),
        )
        if (original.collectionId !== manifest.sourceCollectionId) {
          throw new BackupArchiveError("corrupt", "Source manifest identity mismatch")
        }
        const replacement = collectionManifestSchema.parse({
          format: original.format,
          schemaVersion: original.schemaVersion,
          collectionId: target.collectionId,
        })
        await target.write(path, Buffer.from(`${JSON.stringify(replacement, null, 2)}\n`))
      } else {
        await target.write(path, bytes)
      }
    }
    await target.commit()
    return {
      sourceCollectionId: manifest.sourceCollectionId,
      targetCollectionId: target.collectionId,
      entryCount: manifest.entries.length,
      totalBytes: manifest.entries.reduce((sum, entry) => sum + entry.size, 0),
    }
  } catch (error) {
    await target.discard()
    throw error
  }
}
