import { lstat, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { type DocumentId, documentIdSchema, type Sha256, sha256Schema } from "../shared/schemas"
import { createAstFingerprint } from "./documentAstStore"
import { HYBRID_PAGE_CACHE_VERSION } from "./hybridPageParser"

/** The folder `PaddlePageParserService` keeps Paddle's own pages in. */
export const PADDLE_PAGE_CACHE_VERSION = "paddleocr-vl-1.6-page-v3"
/** The folder of Mistral pages, which `documentPageParser.ts` still reads as a fallback. */
export const MISTRAL_PAGE_CACHE_VERSION = "mistral-ocr-4-1-blocks-v2"
/** Page cache folders the current parsers read or write; every other version is stale. */
export const CURRENT_PAGE_CACHE_VERSIONS: ReadonlySet<string> = new Set([
  HYBRID_PAGE_CACHE_VERSION,
  PADDLE_PAGE_CACHE_VERSION,
  MISTRAL_PAGE_CACHE_VERSION,
])

/** The fingerprint the source AST of `hash` is stored under now, as `DocumentAstService` makes it. */
export function currentAstFingerprint(hash: Sha256): string {
  return createAstFingerprint({
    sourceHash: hash,
    extractorVersion: "pdfjs-6-source-1",
    configVersion: "source-only-v1",
  })
}

/** Anything changed this recently may belong to a writer still at work, so it stays. */
const MINIMUM_AGE_MS = 10 * 60_000
/** Removals per run; whatever remains goes on a later start. */
const MAX_REMOVALS = 10_000
const astEntryPattern = /^([a-f0-9]{64})(?:\.semantic)?\.json(\.[^/\\]+\.tmp)?$/u
const layoutEntryPattern = /^([a-f0-9]{16})\.json$/u

export type DerivedCacheCleanupInput = {
  readonly root: string
  /** Whether a content hash belongs to a library paper; asked just before its caches go. */
  readonly isLibraryHash: (hash: Sha256) => boolean
  readonly isLibraryDocument: (id: DocumentId) => boolean
  readonly signal: AbortSignal
  readonly now?: () => number
  readonly minimumAgeMs?: number
}

export type DerivedCacheCleanupResult = {
  readonly removed: number
  /** Entries that could not be inspected or removed; they are tried again on a later run. */
  readonly failed: number
  /** False when aborted or stopped at the removal bound. */
  readonly complete: boolean
}

type Cleanup = DerivedCacheCleanupInput & {
  readonly clock: () => number
  readonly minimumAge: number
  removed: number
  failed: number
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function stopped(cleanup: Cleanup): boolean {
  return cleanup.signal.aborted || cleanup.removed >= MAX_REMOVALS
}

/** Names of the real (not linked) entries of `directory` that `keep` accepts. */
async function entries(
  directory: string,
  keep: (entry: { isDirectory(): boolean; isFile(): boolean }) => boolean,
): Promise<readonly string[]> {
  try {
    const listed = await readdir(directory, { withFileTypes: true })
    return listed.filter((entry) => !entry.isSymbolicLink() && keep(entry)).map(({ name }) => name)
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

const directories = (directory: string) => entries(directory, (entry) => entry.isDirectory())
const files = (directory: string) => entries(directory, (entry) => entry.isFile())

/** The latest change to `path` or, for `depth` 1, to the folders directly inside it. */
async function lastChange(path: string, depth: 0 | 1): Promise<number> {
  const own = (await lstat(path)).mtimeMs
  if (depth === 0) return own
  const inner = await directories(path)
  const times = await Promise.all(
    inner.map(async (name) => (await lstat(join(path, name))).mtimeMs),
  )
  return Math.max(own, ...times)
}

async function removeSettled(cleanup: Cleanup, path: string, depth: 0 | 1): Promise<void> {
  if (stopped(cleanup)) return
  try {
    if (cleanup.clock() - (await lastChange(path, depth)) < cleanup.minimumAge) return
    await rm(path, { recursive: true, force: true, maxRetries: 2 })
    cleanup.removed += 1
  } catch (error) {
    if (!isMissing(error)) cleanup.failed += 1
  }
}

/**
 * Walks `<cache>/<hash>` folders: those of papers no longer in the library go whole, and
 * `withinLibrary` tidies the folders of the papers still there.
 */
async function cleanHashFolders(
  cleanup: Cleanup,
  cache: string,
  withinLibrary: ((folder: string, hash: Sha256) => Promise<void>) | null,
): Promise<void> {
  const base = join(cleanup.root, cache)
  for (const name of await directories(base)) {
    if (stopped(cleanup)) return
    const hash = sha256Schema.safeParse(name)
    if (!hash.success) continue
    const folder = join(base, name)
    if (!cleanup.isLibraryHash(hash.data)) await removeSettled(cleanup, folder, 1)
    else await withinLibrary?.(folder, hash.data)
  }
}

async function cleanStalePageVersions(cleanup: Cleanup, folder: string): Promise<void> {
  for (const version of await directories(folder)) {
    if (!CURRENT_PAGE_CACHE_VERSIONS.has(version))
      await removeSettled(cleanup, join(folder, version), 0)
  }
}

async function cleanStaleAsts(cleanup: Cleanup, folder: string, hash: Sha256): Promise<void> {
  const current = currentAstFingerprint(hash)
  for (const file of await files(folder)) {
    const match = astEntryPattern.exec(file)
    // A leftover temporary file is stale even under the current fingerprint.
    if (match && (match[1] !== current || match[2] !== undefined))
      await removeSettled(cleanup, join(folder, file), 0)
  }
}

async function cleanOrphanLayouts(cleanup: Cleanup): Promise<void> {
  const base = join(cleanup.root, "layout")
  for (const file of await files(base)) {
    if (stopped(cleanup)) return
    const id = documentIdSchema.safeParse(layoutEntryPattern.exec(file)?.[1])
    if (id.success && !cleanup.isLibraryDocument(id.data))
      await removeSettled(cleanup, join(base, file), 0)
  }
}

/**
 * Removes derived caches nothing reads any more: page caches of earlier parser versions,
 * source ASTs under earlier fingerprints, and the parsed pages, ASTs, translations and
 * layouts of papers no longer in the library. Translations of library papers cost AI calls
 * and are never touched, nor is anything outside these cache folders.
 */
export async function cleanDerivedCaches(
  input: DerivedCacheCleanupInput,
): Promise<DerivedCacheCleanupResult> {
  const cleanup: Cleanup = {
    ...input,
    clock: input.now ?? Date.now,
    minimumAge: input.minimumAgeMs ?? MINIMUM_AGE_MS,
    removed: 0,
    failed: 0,
  }
  await cleanHashFolders(cleanup, "parsed-pages", (folder) =>
    cleanStalePageVersions(cleanup, folder),
  )
  await cleanHashFolders(cleanup, "document-ast", (folder, hash) =>
    cleanStaleAsts(cleanup, folder, hash),
  )
  await cleanHashFolders(cleanup, "page-translations", null)
  await cleanOrphanLayouts(cleanup)
  return { removed: cleanup.removed, failed: cleanup.failed, complete: !stopped(cleanup) }
}
