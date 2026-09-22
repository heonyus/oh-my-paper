import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  type CollectionManifest,
  collectionIdSchema,
  collectionManifestHeaderSchema,
  collectionManifestSchema,
  noteRelativePathSchema,
} from "../shared/collectionSchemas"
import { CollectionFileError, collectionFileError } from "./collectionErrors"
import type {
  AssetFile,
  CollectionFilesOptions,
  NoteFile,
  SaveNoteInput,
  SaveNoteResult,
} from "./collectionFileTypes"
import {
  createCanonicalNoteBytes,
  initialNoteRelativePath,
  readCanonicalNoteId,
} from "./collectionFrontmatter"
import { CollectionJournal, replaceDurably, revisionOf } from "./collectionJournal"
import {
  type CollectionWriteContext,
  saveNoteNow,
  scanNoteFiles,
  writeAssetNow,
} from "./collectionNoteFiles"
import {
  assertCollectionTreeSafe,
  canonicalCollectionRoot,
  collectionReliabilityWarning,
  resolveCollectionPath,
} from "./collectionPaths"
import {
  acknowledgeRecoveredEntry,
  type CollectionRecoveryResult,
  recoverCollectionJournal,
} from "./collectionRecovery"
import { CollectionWriterLock } from "./collectionWriterLock"
import { NoteHistory } from "./noteHistory"

export type { AssetFile, CollectionFilesOptions, NoteFile, SaveNoteInput, SaveNoteResult }
export { CollectionFileError, createCanonicalNoteBytes, initialNoteRelativePath }

async function optionalRead(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}

async function readManifest(root: string): Promise<CollectionManifest> {
  const raw = JSON.parse(await readFile(join(root, "collection.json"), "utf8"))
  const header = collectionManifestHeaderSchema.safeParse(raw)
  if (
    header.success &&
    header.data.format === "scourgify-collection" &&
    header.data.schemaVersion > 1
  ) {
    throw new CollectionFileError("unsupported_schema")
  }
  try {
    return collectionManifestSchema.parse(raw)
  } catch (error) {
    throw collectionFileError(error, "invalid_collection")
  }
}

export async function initializeCollection(
  root: string,
  uncheckedCollectionId: string,
): Promise<void> {
  try {
    const collectionId = collectionIdSchema.parse(uncheckedCollectionId)
    await mkdir(root, { recursive: true })
    await assertCollectionTreeSafe(root)
    const manifestPath = join(await canonicalCollectionRoot(root), "collection.json")
    if (await optionalRead(manifestPath)) throw new CollectionFileError("invalid_collection")
    await Promise.all(
      [
        "notes",
        "papers",
        "assets",
        ".ohmypaper/journal",
        ".ohmypaper/history",
        ".ohmypaper/conflicts",
        ".ohmypaper/recovery",
      ].map((path) => mkdir(join(root, path), { recursive: true })),
    )
    const manifest = collectionManifestSchema.parse({
      format: "scourgify-collection",
      schemaVersion: 1,
      collectionId,
    })
    await replaceDurably(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`))
  } catch (error) {
    throw collectionFileError(error, "invalid_collection")
  }
}

export class CollectionFiles {
  readonly journal: CollectionJournal
  readonly history: NoteHistory
  readonly reliabilityWarning: string | null
  private queue: Promise<void> = Promise.resolve()

  private constructor(
    readonly root: string,
    readonly manifest: CollectionManifest,
    private readonly lock: CollectionWriterLock,
    private readonly options: CollectionFilesOptions,
    reliabilityWarning: string | null,
  ) {
    this.journal = new CollectionJournal(root)
    this.history = new NoteHistory(root, options.now ? { now: options.now } : {})
    this.reliabilityWarning = reliabilityWarning
  }

  static async open(
    uncheckedRoot: string,
    options: CollectionFilesOptions = {},
  ): Promise<CollectionFiles> {
    try {
      const root = await canonicalCollectionRoot(uncheckedRoot)
      const manifest = await readManifest(root)
      await assertCollectionTreeSafe(root)
      await scanNoteFiles(root)
      const lock = await CollectionWriterLock.acquire(root, options.now?.() ?? new Date())
      return new CollectionFiles(
        root,
        manifest,
        lock,
        options,
        await collectionReliabilityWarning(root),
      )
    } catch (error) {
      throw collectionFileError(error, "invalid_collection")
    }
  }

  async close(): Promise<void> {
    await this.queue
    try {
      await this.lock.release()
    } catch (error) {
      throw collectionFileError(error, "writer_lock_changed")
    }
  }

  async readNote(relativePath: string): Promise<NoteFile> {
    try {
      const parsedPath = noteRelativePathSchema.parse(relativePath)
      const resolved = await resolveCollectionPath(this.root, parsedPath)
      const bytes = await readFile(resolved.path)
      return {
        noteId: readCanonicalNoteId(bytes),
        relativePath: parsedPath,
        revision: revisionOf(bytes),
        bytes,
      }
    } catch (error) {
      throw collectionFileError(error, "read_failed")
    }
  }

  async scanNotes(): Promise<readonly NoteFile[]> {
    try {
      return await scanNoteFiles(this.root)
    } catch (error) {
      throw collectionFileError(error, "read_failed")
    }
  }

  async saveNote(input: SaveNoteInput): Promise<SaveNoteResult> {
    return await this.enqueue(async () => {
      try {
        return await saveNoteNow(this.writeContext(), input)
      } catch (error) {
        throw collectionFileError(error, "write_failed")
      }
    })
  }

  async writeAsset(input: {
    readonly bytes: Uint8Array
    readonly extension: string
  }): Promise<AssetFile> {
    return await this.enqueue(async () => {
      try {
        return await writeAssetNow(this.writeContext(), input)
      } catch (error) {
        throw collectionFileError(error, "write_failed")
      }
    })
  }

  async recover(): Promise<readonly CollectionRecoveryResult[]> {
    try {
      return await recoverCollectionJournal(this.root, this.journal, this.history)
    } catch (error) {
      throw collectionFileError(error, "recovery_failed")
    }
  }

  async acknowledgeRecovery(operationId: string): Promise<void> {
    try {
      await acknowledgeRecoveredEntry(this.root, this.journal, operationId)
    } catch (error) {
      throw collectionFileError(error, "recovery_failed")
    }
  }

  private writeContext(): CollectionWriteContext {
    return {
      root: this.root,
      journal: this.journal,
      history: this.history,
      now: this.options.now ?? (() => new Date()),
      hooks: this.options.hooks ?? {},
    }
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.queue.then(operation)
    this.queue = queued.then(
      () => undefined,
      () => undefined,
    )
    return await queued
  }
}
