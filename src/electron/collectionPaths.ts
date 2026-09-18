import { lstat, readdir, realpath, statfs } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import {
  type CollectionRelativePath,
  collectionRelativePathSchema,
  type NoteRelativePath,
  noteRelativePathSchema,
} from "../shared/collectionSchemas"

export type CollectionPathErrorKind =
  | "path_escape"
  | "path_collision"
  | "symlink_escape"
  | "unsupported_file"

export class CollectionPathError extends Error {
  readonly name = "CollectionPathError"

  constructor(
    readonly kind: CollectionPathErrorKind,
    readonly relativePath: string,
  ) {
    super(`${kind}: ${relativePath}`)
  }
}

function collisionKey(name: string): string {
  return name.normalize("NFC").toLocaleLowerCase("en-US")
}

function staysInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path)
  return fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !fromRoot.startsWith(sep)
}

async function matchingEntry(parent: string, segment: string): Promise<string | null> {
  const entries = await readdir(parent)
  const key = collisionKey(segment)
  const matches = entries.filter((entry) => collisionKey(entry) === key)
  if (matches.length > 1 || (matches.length === 1 && matches[0] !== segment)) {
    throw new CollectionPathError("path_collision", join(parent, segment))
  }
  return matches[0] ?? null
}

export async function canonicalCollectionRoot(root: string): Promise<string> {
  return await realpath(root)
}

export async function resolveCollectionPath(
  root: string,
  uncheckedRelativePath: string,
): Promise<{
  readonly root: string
  readonly relativePath: CollectionRelativePath
  readonly path: string
}> {
  const parsed = collectionRelativePathSchema.safeParse(uncheckedRelativePath)
  if (!parsed.success) throw new CollectionPathError("path_escape", uncheckedRelativePath)
  const canonicalRoot = await canonicalCollectionRoot(root)
  const target = join(canonicalRoot, ...parsed.data.split("/"))
  if (!staysInside(canonicalRoot, target)) {
    throw new CollectionPathError("path_escape", uncheckedRelativePath)
  }
  let parent = canonicalRoot
  for (const segment of parsed.data.split("/")) {
    const entry = await matchingEntry(parent, segment)
    if (entry === null) break
    const candidate = join(parent, entry)
    const metadata = await lstat(candidate)
    if (metadata.isSymbolicLink()) {
      throw new CollectionPathError("symlink_escape", uncheckedRelativePath)
    }
    parent = candidate
  }
  return { root: canonicalRoot, relativePath: parsed.data, path: target }
}

async function walkSafeDirectory(root: string, directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const keys = new Set<string>()
  const files: string[] = []
  for (const entry of entries) {
    const key = collisionKey(entry.name)
    if (keys.has(key)) {
      throw new CollectionPathError("path_collision", relative(root, join(directory, entry.name)))
    }
    keys.add(key)
    const path = join(directory, entry.name)
    const relativePath = relative(root, path).split(sep).join("/")
    if (entry.isSymbolicLink()) throw new CollectionPathError("symlink_escape", relativePath)
    if (entry.isDirectory()) {
      files.push(...(await walkSafeDirectory(root, path)))
    } else if (entry.isFile()) {
      files.push(relativePath)
    } else {
      throw new CollectionPathError("unsupported_file", relativePath)
    }
  }
  return files
}

export async function assertCollectionTreeSafe(root: string): Promise<void> {
  const canonicalRoot = await canonicalCollectionRoot(root)
  await walkSafeDirectory(canonicalRoot, canonicalRoot)
}

export async function listNotePaths(root: string): Promise<readonly NoteRelativePath[]> {
  const canonicalRoot = await canonicalCollectionRoot(root)
  const notes = await resolveCollectionPath(canonicalRoot, "notes")
  const files = await walkSafeDirectory(canonicalRoot, notes.path)
  return files
    .filter((path) => path.toLocaleLowerCase("en-US").endsWith(".md"))
    .map((path) => noteRelativePathSchema.parse(path))
    .sort()
}

const remoteFilesystemTypes = new Set([0x6969, 0x736d6273, 0x77656264])

export async function collectionReliabilityWarning(root: string): Promise<string | null> {
  const details = await statfs(await canonicalCollectionRoot(root))
  if (remoteFilesystemTypes.has(Number(details.type))) {
    return "This filesystem may not provide reliable local rename and flush semantics."
  }
  return null
}

export function collectionMetadataFile(root: string): string {
  return join(root, ".scourgify", "metadata.sqlite")
}

export function collectionIndexFile(userDataRoot: string, collectionId: string): string {
  return join(userDataRoot, "collections", collectionId, "index.sqlite")
}

export function collectionRootForId(userDataRoot: string, collectionId: string): string {
  return join(userDataRoot, "collections", collectionId, "collection")
}
