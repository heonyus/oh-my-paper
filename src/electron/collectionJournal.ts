import { createHash, randomUUID } from "node:crypto"
import type { FileHandle } from "node:fs/promises"
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { z } from "zod"
import {
  type CollectionJournalEntry,
  type CollectionRevision,
  collectionJournalEntrySchema,
  collectionRevisionSchema,
  type NoteId,
} from "../shared/collectionSchemas"

export type JournalStageInput = {
  readonly kind: "note" | "asset"
  readonly relativePath: string
  readonly expectedRevision: CollectionRevision | null
  readonly previousRevision: CollectionRevision | null
  readonly nextRevision: CollectionRevision
  readonly noteId: NoteId | null
  readonly createdAt: string
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === "win32") return
  const handle = await open(path, "r")
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export async function writeNewFlushed(path: string, bytes: Uint8Array): Promise<void> {
  let handle: FileHandle | undefined
  try {
    handle = await open(path, "wx", 0o600)
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle?.close()
  }
}

export async function replaceDurably(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  try {
    await writeNewFlushed(temporary, bytes)
    await rename(temporary, path)
    await syncDirectory(dirname(path))
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export class CollectionJournalError extends Error {
  readonly name = "CollectionJournalError"

  constructor(
    readonly kind: "invalid_journal" | "target_changed",
    cause?: unknown,
  ) {
    super(cause instanceof Error ? `${kind}: ${cause.message}` : kind)
  }
}

export class CollectionJournal {
  readonly directory: string

  constructor(readonly root: string) {
    this.directory = join(root, ".ohmypaper", "journal")
  }

  private entryPath(operationId: string): string {
    return join(this.directory, `${operationId}.json`)
  }

  async stage(
    input: JournalStageInput,
    previousBytes: Uint8Array | null,
    incomingBytes: Uint8Array,
  ): Promise<CollectionJournalEntry> {
    await mkdir(this.directory, { recursive: true })
    const operationId = randomUUID()
    const previousRelativePath = previousBytes ? `.ohmypaper/journal/${operationId}.previous` : null
    const incomingRelativePath = `.ohmypaper/journal/${operationId}.incoming`
    const temporaryRelativePath = `${dirname(input.relativePath)}/.${basename(input.relativePath)}.${operationId}.tmp`
    if (previousBytes && previousRelativePath) {
      await writeNewFlushed(join(this.root, previousRelativePath), previousBytes)
    }
    await writeNewFlushed(join(this.root, incomingRelativePath), incomingBytes)
    const entry = collectionJournalEntrySchema.parse({
      ...input,
      operationId,
      state: "staged",
      temporaryRelativePath,
      previousRelativePath,
      incomingRelativePath,
    })
    await replaceDurably(this.entryPath(operationId), Buffer.from(JSON.stringify(entry)))
    return entry
  }

  async prepare(entry: CollectionJournalEntry): Promise<CollectionJournalEntry> {
    await mkdir(dirname(join(this.root, entry.temporaryRelativePath)), { recursive: true })
    await writeNewFlushed(
      join(this.root, entry.temporaryRelativePath),
      await readFile(join(this.root, entry.incomingRelativePath)),
    )
    return await this.update(entry, "prepared")
  }

  async commit(entry: CollectionJournalEntry): Promise<CollectionJournalEntry> {
    const target = join(this.root, entry.relativePath)
    const currentBytes = await optionalRead(target)
    const currentRevision = currentBytes ? revisionOf(currentBytes) : null
    if (currentRevision !== entry.previousRevision) {
      throw new CollectionJournalError("target_changed")
    }
    await rename(join(this.root, entry.temporaryRelativePath), target)
    await syncDirectory(dirname(target))
    return await this.update(entry, "file_committed")
  }

  async update(
    entry: CollectionJournalEntry,
    state: CollectionJournalEntry["state"],
  ): Promise<CollectionJournalEntry> {
    const updated = collectionJournalEntrySchema.parse({ ...entry, state })
    await replaceDurably(this.entryPath(entry.operationId), Buffer.from(JSON.stringify(updated)))
    return updated
  }

  async entries(): Promise<readonly CollectionJournalEntry[]> {
    await mkdir(this.directory, { recursive: true })
    const names = (await readdir(this.directory)).filter((name) => name.endsWith(".json")).sort()
    try {
      return await Promise.all(
        names.map(async (name) =>
          collectionJournalEntrySchema.parse(
            JSON.parse(await readFile(join(this.directory, name), "utf8")),
          ),
        ),
      )
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        throw new CollectionJournalError("invalid_journal", error)
      }
      throw error
    }
  }

  async complete(entry: CollectionJournalEntry): Promise<void> {
    const paths = [
      entry.temporaryRelativePath,
      entry.previousRelativePath,
      entry.incomingRelativePath,
    ].filter((path): path is string => path !== null)
    await Promise.all(paths.map((path) => rm(join(this.root, path), { force: true })))
    await rm(this.entryPath(entry.operationId), { force: true })
    await syncDirectory(this.directory)
  }

  async find(operationId: string): Promise<CollectionJournalEntry | null> {
    const id = z.string().uuid().parse(operationId)
    try {
      return collectionJournalEntrySchema.parse(
        JSON.parse(await readFile(this.entryPath(id), "utf8")),
      )
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }
}

async function optionalRead(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

export function revisionOf(bytes: Uint8Array): CollectionRevision {
  return collectionRevisionSchema.parse(createHash("sha256").update(bytes).digest("hex"))
}
