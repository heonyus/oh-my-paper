import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import {
  type CollectionRevision,
  collectionRevisionSchema,
  type NoteConflictMetadata,
  type NoteHistoryReason,
  type NoteHistorySnapshot,
  type NoteId,
  noteConflictMetadataSchema,
  noteHistoryReasonSchema,
  noteHistorySnapshotSchema,
  noteIdSchema,
} from "../shared/collectionSchemas"
import { replaceDurably, revisionOf } from "./collectionJournal"

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000
const TYPING_INTERVAL_MS = 30_000

type NoteHistoryOptions = {
  readonly now?: () => Date
}

type RecordSnapshotInput = {
  readonly noteId: string
  readonly bytes: Uint8Array
  readonly reason: NoteHistoryReason
}

type RecordConflictInput = {
  readonly noteId: string
  readonly relativePath: string
  readonly currentBytes: Uint8Array | null
  readonly incomingBytes: Uint8Array
  readonly currentRevision: CollectionRevision | null
  readonly incomingRevision: CollectionRevision
}

export type RetainedConflict = {
  readonly metadata: NoteConflictMetadata
  readonly currentBytes: Uint8Array | null
  readonly incomingBytes: Uint8Array
}

export class NoteHistory {
  readonly #now: () => Date

  constructor(
    readonly root: string,
    options: NoteHistoryOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date())
  }

  private historyDirectory(noteId: NoteId): string {
    return join(this.root, ".ohmypaper", "history", noteId)
  }

  private conflictDirectory(conflictId: string): string {
    return join(this.root, ".ohmypaper", "conflicts", conflictId)
  }

  async recordSnapshot(input: RecordSnapshotInput): Promise<NoteHistorySnapshot | null> {
    const noteId = noteIdSchema.parse(input.noteId)
    const reason = noteHistoryReasonSchema.parse(input.reason)
    const createdAt = this.#now().toISOString()
    if (reason === "typing") {
      const latest = (await this.listSnapshots(noteId))[0]
      if (latest && Date.parse(createdAt) - Date.parse(latest.createdAt) < TYPING_INTERVAL_MS) {
        return null
      }
    }
    const snapshotId = randomUUID()
    const directory = this.historyDirectory(noteId)
    const bytesRelativePath = `.ohmypaper/history/${noteId}/${snapshotId}.md`
    const snapshot = noteHistorySnapshotSchema.parse({
      snapshotId,
      noteId,
      revision: revisionOf(input.bytes),
      reason,
      createdAt,
      bytesRelativePath,
    })
    await mkdir(directory, { recursive: true })
    await replaceDurably(join(this.root, bytesRelativePath), input.bytes)
    await replaceDurably(
      join(directory, `${snapshotId}.json`),
      Buffer.from(JSON.stringify(snapshot)),
    )
    return snapshot
  }

  async listSnapshots(uncheckedNoteId: string): Promise<readonly NoteHistorySnapshot[]> {
    const noteId = noteIdSchema.parse(uncheckedNoteId)
    const directory = this.historyDirectory(noteId)
    let names: readonly string[]
    try {
      names = await readdir(directory)
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
      throw error
    }
    const snapshots = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map(async (name) =>
          noteHistorySnapshotSchema.parse(
            JSON.parse(await readFile(join(directory, name), "utf8")),
          ),
        ),
    )
    return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async readSnapshot(uncheckedNoteId: string, snapshotId: string): Promise<Uint8Array> {
    const noteId = noteIdSchema.parse(uncheckedNoteId)
    const id = noteHistorySnapshotSchema.shape.snapshotId.parse(snapshotId)
    const metadata = noteHistorySnapshotSchema.parse(
      JSON.parse(await readFile(join(this.historyDirectory(noteId), `${id}.json`), "utf8")),
    )
    return await readFile(join(this.root, metadata.bytesRelativePath))
  }

  async recordConflict(input: RecordConflictInput): Promise<NoteConflictMetadata> {
    const noteId = noteIdSchema.parse(input.noteId)
    const conflictId = randomUUID()
    const directory = this.conflictDirectory(conflictId)
    const currentBytesRelativePath = input.currentBytes
      ? `.ohmypaper/conflicts/${conflictId}/current.md`
      : null
    const incomingBytesRelativePath = `.ohmypaper/conflicts/${conflictId}/incoming.md`
    const metadata = noteConflictMetadataSchema.parse({
      conflictId,
      status: "unresolved",
      noteId,
      relativePath: input.relativePath,
      currentRevision: input.currentRevision,
      incomingRevision: input.incomingRevision,
      currentBytesRelativePath,
      incomingBytesRelativePath,
      createdAt: this.#now().toISOString(),
    })
    await mkdir(directory, { recursive: true })
    if (input.currentBytes && currentBytesRelativePath) {
      await replaceDurably(join(this.root, currentBytesRelativePath), input.currentBytes)
    }
    await replaceDurably(join(this.root, incomingBytesRelativePath), input.incomingBytes)
    await replaceDurably(join(directory, "metadata.json"), Buffer.from(JSON.stringify(metadata)))
    return metadata
  }

  async readConflict(conflictId: string): Promise<RetainedConflict> {
    const id = noteConflictMetadataSchema.shape.conflictId.parse(conflictId)
    const metadata = noteConflictMetadataSchema.parse(
      JSON.parse(await readFile(join(this.conflictDirectory(id), "metadata.json"), "utf8")),
    )
    const currentBytes = metadata.currentBytesRelativePath
      ? await readFile(join(this.root, metadata.currentBytesRelativePath))
      : null
    return {
      metadata,
      currentBytes,
      incomingBytes: await readFile(join(this.root, metadata.incomingBytesRelativePath)),
    }
  }

  async listConflicts(): Promise<readonly NoteConflictMetadata[]> {
    const root = join(this.root, ".ohmypaper", "conflicts")
    let names: readonly string[]
    try {
      names = await readdir(root)
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
      throw error
    }
    const conflicts = await Promise.all(
      names.map(async (name) => (await this.readConflict(name)).metadata),
    )
    return conflicts.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async resolveConflict(conflictId: string): Promise<void> {
    const retained = await this.readConflict(conflictId)
    const resolved = noteConflictMetadataSchema.parse({ ...retained.metadata, status: "resolved" })
    await replaceDurably(
      join(this.conflictDirectory(conflictId), "metadata.json"),
      Buffer.from(JSON.stringify(resolved)),
    )
  }

  async prune(): Promise<number> {
    const protectedRevisions = await this.unresolvedConflictRevisions()
    const historyRoot = join(this.root, ".ohmypaper", "history")
    let noteDirectories: readonly string[]
    try {
      noteDirectories = await readdir(historyRoot)
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0
      throw error
    }
    const cutoff = this.#now().getTime() - THIRTY_DAYS_MS
    let removed = 0
    for (const noteDirectory of noteDirectories) {
      const snapshots = await this.listSnapshots(noteDirectory)
      for (const snapshot of snapshots) {
        if (Date.parse(snapshot.createdAt) >= cutoff || protectedRevisions.has(snapshot.revision))
          continue
        await rm(join(this.root, snapshot.bytesRelativePath), { force: true })
        await rm(join(this.historyDirectory(snapshot.noteId), `${snapshot.snapshotId}.json`), {
          force: true,
        })
        removed += 1
      }
    }
    return removed
  }

  private async unresolvedConflictRevisions(): Promise<ReadonlySet<CollectionRevision>> {
    const conflictRoot = join(this.root, ".ohmypaper", "conflicts")
    const revisions = new Set<CollectionRevision>()
    let names: readonly string[]
    try {
      names = await readdir(conflictRoot)
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return revisions
      throw error
    }
    for (const name of names) {
      const retained = await this.readConflict(name)
      if (retained.metadata.status === "resolved") continue
      revisions.add(collectionRevisionSchema.parse(retained.metadata.incomingRevision))
      if (retained.metadata.currentRevision) revisions.add(retained.metadata.currentRevision)
    }
    return revisions
  }

  async writeRecoveryDraft(uncheckedNoteId: string, bytes: Uint8Array): Promise<void> {
    const noteId = noteIdSchema.parse(uncheckedNoteId)
    await replaceDurably(join(this.root, ".ohmypaper", "recovery", `${noteId}.md`), bytes)
  }

  async readRecoveryDraft(uncheckedNoteId: string): Promise<Uint8Array | null> {
    const noteId = noteIdSchema.parse(uncheckedNoteId)
    try {
      return await readFile(join(this.root, ".ohmypaper", "recovery", `${noteId}.md`))
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
      throw error
    }
  }
}
