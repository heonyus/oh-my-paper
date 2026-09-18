import { createHash } from "node:crypto"
import { copyFile, mkdir, readdir, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"

export type MigrationCopy = {
  readonly relativePath: string
  readonly sha256: string
  readonly bytes: number
}

const MAX_BACKUP_FILES = 20_000
const MAX_BACKUP_BYTES = 20 * 1024 * 1024 * 1024

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/")
}

export async function copyRegularTree(
  source: string,
  destination: string,
): Promise<readonly MigrationCopy[]> {
  const copied: MigrationCopy[] = []
  let totalBytes = 0

  async function visit(sourceDirectory: string, destinationDirectory: string): Promise<void> {
    await mkdir(destinationDirectory, { recursive: true })
    for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
      const sourcePath = join(sourceDirectory, entry.name)
      const destinationPath = join(destinationDirectory, entry.name)
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        throw new Error(`Unsupported migration entry: ${portableRelative(source, sourcePath)}`)
      }
      if (entry.isDirectory()) {
        await visit(sourcePath, destinationPath)
        continue
      }
      if (copied.length >= MAX_BACKUP_FILES) throw new Error("Legacy backup file limit exceeded")
      const bytes = await readFile(sourcePath)
      totalBytes += bytes.byteLength
      if (totalBytes > MAX_BACKUP_BYTES) throw new Error("Legacy backup byte limit exceeded")
      await copyFile(sourcePath, destinationPath)
      copied.push({
        relativePath: portableRelative(source, sourcePath),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
      })
    }
  }

  await visit(source, destination)
  return copied
}
