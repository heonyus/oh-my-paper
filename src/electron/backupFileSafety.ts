import { open } from "node:fs/promises"
import { relative, resolve, sep } from "node:path"
import {
  MAX_BACKUP_ENTRIES,
  MAX_BACKUP_FILE_BYTES,
  MAX_BACKUP_TOTAL_BYTES,
} from "../shared/backupSchemas"
import { collectionRelativePathSchema } from "../shared/collectionSchemas"
import { BackupArchiveError } from "./backupArchive"
import { CollectionPathError, resolveCollectionPath } from "./collectionPaths"

export type WalkBudget = { entries: number; totalBytes: number }

export function safePath(root: string, uncheckedPath: string): string {
  const path = collectionRelativePathSchema.parse(uncheckedPath)
  const target = resolve(root, ...path.split("/"))
  const fromRoot = relative(root, target)
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith(sep)) {
    throw new BackupArchiveError("unsafe_path", `Path escapes backup root: ${uncheckedPath}`)
  }
  return target
}

export async function existingPath(root: string, uncheckedPath: string): Promise<string> {
  try {
    return (await resolveCollectionPath(root, uncheckedPath)).path
  } catch (error) {
    if (error instanceof CollectionPathError) {
      const kind = error.kind === "symlink_escape" ? "symlink" : "unsafe_path"
      throw new BackupArchiveError(kind, `Unsafe collection path: ${uncheckedPath}`, {
        cause: error,
      })
    }
    throw error
  }
}

export function reserve(budget: WalkBudget, relativePath: string, size: number): void {
  if (budget.entries >= MAX_BACKUP_ENTRIES)
    throw new BackupArchiveError("size_limit", "Backup contains too many entries")
  if (size > MAX_BACKUP_FILE_BYTES)
    throw new BackupArchiveError("size_limit", `Backup file is too large: ${relativePath}`)
  if (budget.totalBytes > MAX_BACKUP_TOTAL_BYTES - size)
    throw new BackupArchiveError("size_limit", "Backup exceeds the total size limit")
  budget.entries += 1
  budget.totalBytes += size
}

export async function readBounded(
  path: string,
  size: number,
  relativePath: string,
): Promise<Uint8Array> {
  if (size > MAX_BACKUP_FILE_BYTES)
    throw new BackupArchiveError("size_limit", `Backup file is too large: ${relativePath}`)
  const handle = await open(path, "r")
  try {
    const bytes = Buffer.alloc(size)
    const result = await handle.read(bytes, 0, size, 0)
    const metadata = await handle.stat()
    if (metadata.size !== size || result.bytesRead !== size) {
      throw new BackupArchiveError("corrupt", `Collection changed while reading: ${relativePath}`)
    }
    return bytes
  } finally {
    await handle.close()
  }
}
