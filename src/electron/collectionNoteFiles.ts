import { readFile, stat } from "node:fs/promises"
import {
  assetRelativePathSchema,
  type CollectionJournalEntry,
  collectionRevisionSchema,
  type NoteId,
  noteRelativePathSchema,
} from "../shared/collectionSchemas"
import { CollectionFileError } from "./collectionErrors"
import type { AssetFile, NoteFile, SaveNoteInput, SaveNoteResult } from "./collectionFileTypes"
import { readCanonicalNoteId } from "./collectionFrontmatter"
import type { CollectionJournal } from "./collectionJournal"
import { CollectionJournalError, revisionOf } from "./collectionJournal"
import { listNotePaths, resolveCollectionPath } from "./collectionPaths"
import type { NoteHistory } from "./noteHistory"

export type CollectionWriteContext = {
  readonly root: string
  readonly journal: CollectionJournal
  readonly history: NoteHistory
  readonly now: () => Date
  readonly hooks: {
    readonly afterJournalStaged?: () => Promise<void>
    readonly afterPrepared?: () => Promise<void>
    readonly afterRename?: () => Promise<void>
  }
}

const MAX_NOTE_FILES = 4_096
const MAX_NOTE_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_NOTE_BYTES = 64 * 1024 * 1024
const NOTE_SCAN_CONCURRENCY = 8

export class CollectionScanBudgetError extends Error {
  readonly name = "CollectionScanBudgetError"

  constructor(
    readonly kind: "note_count" | "per_note_bytes" | "aggregate_bytes",
    readonly limit: number,
    readonly actual: number,
    readonly relativePath: string | null,
  ) {
    super(`${kind}: ${actual} exceeds ${limit}`)
  }
}

type SizedNotePath = {
  readonly relativePath: NoteFile["relativePath"]
  readonly size: number
}

async function optionalRead(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}

export async function scanNoteFiles(root: string): Promise<readonly NoteFile[]> {
  const paths = await listNotePaths(root)
  if (paths.length > MAX_NOTE_FILES) {
    throw new CollectionScanBudgetError("note_count", MAX_NOTE_FILES, paths.length, null)
  }
  const sized: SizedNotePath[] = []
  for (let start = 0; start < paths.length; start += NOTE_SCAN_CONCURRENCY) {
    const batch = paths.slice(start, start + NOTE_SCAN_CONCURRENCY)
    const batchSizes = await Promise.all(
      batch.map(async (relativePath): Promise<SizedNotePath> => {
        const resolved = await resolveCollectionPath(root, relativePath)
        const size = (await stat(resolved.path)).size
        if (size > MAX_NOTE_BYTES) {
          throw new CollectionScanBudgetError("per_note_bytes", MAX_NOTE_BYTES, size, relativePath)
        }
        return { relativePath, size }
      }),
    )
    sized.push(...batchSizes)
  }
  const totalBytes = sized.reduce((total, note) => total + note.size, 0)
  if (totalBytes > MAX_TOTAL_NOTE_BYTES) {
    throw new CollectionScanBudgetError("aggregate_bytes", MAX_TOTAL_NOTE_BYTES, totalBytes, null)
  }
  const notes: NoteFile[] = []
  let readBytes = 0
  for (let start = 0; start < paths.length; start += NOTE_SCAN_CONCURRENCY) {
    const batch = paths.slice(start, start + NOTE_SCAN_CONCURRENCY)
    const batchNotes = await Promise.all(
      batch.map(async (relativePath): Promise<NoteFile> => {
        const resolved = await resolveCollectionPath(root, relativePath)
        const bytes = await readFile(resolved.path)
        if (bytes.byteLength > MAX_NOTE_BYTES) {
          throw new CollectionScanBudgetError(
            "per_note_bytes",
            MAX_NOTE_BYTES,
            bytes.byteLength,
            relativePath,
          )
        }
        return {
          noteId: readCanonicalNoteId(bytes),
          relativePath,
          revision: revisionOf(bytes),
          bytes,
        }
      }),
    )
    readBytes += batchNotes.reduce((total, note) => total + note.bytes.byteLength, 0)
    if (readBytes > MAX_TOTAL_NOTE_BYTES) {
      throw new CollectionScanBudgetError("aggregate_bytes", MAX_TOTAL_NOTE_BYTES, readBytes, null)
    }
    notes.push(...batchNotes)
  }
  const ids = new Set<NoteId>()
  for (const note of notes) {
    if (ids.has(note.noteId)) throw new CollectionFileError("duplicate_note_id")
    ids.add(note.noteId)
  }
  return notes
}

export async function saveNoteNow(
  context: CollectionWriteContext,
  input: SaveNoteInput,
): Promise<SaveNoteResult> {
  const relativePath = noteRelativePathSchema.parse(input.relativePath)
  const noteId = readCanonicalNoteId(input.bytes)
  const incomingRevision = revisionOf(input.bytes)
  const expectedRevision = input.expectedRevision
    ? collectionRevisionSchema.parse(input.expectedRevision)
    : null
  const duplicate = (await scanNoteFiles(context.root)).find(
    (note) => note.noteId === noteId && note.relativePath !== relativePath,
  )
  if (duplicate) throw new CollectionFileError("duplicate_note_id")
  const resolved = await resolveCollectionPath(context.root, relativePath)
  const currentBytes = await optionalRead(resolved.path)
  const currentRevision = currentBytes ? revisionOf(currentBytes) : null
  const currentNoteId = currentBytes ? readCanonicalNoteId(currentBytes) : null
  if (currentRevision !== expectedRevision || (currentNoteId && currentNoteId !== noteId)) {
    const conflict = await context.history.recordConflict({
      noteId,
      relativePath,
      currentBytes,
      incomingBytes: input.bytes,
      currentRevision,
      incomingRevision,
    })
    return { kind: "conflict", conflictId: conflict.conflictId, currentRevision, incomingRevision }
  }
  if (currentBytes) {
    await context.history.recordSnapshot({ noteId, bytes: currentBytes, reason: input.reason })
  }
  let entry: CollectionJournalEntry
  try {
    entry = await context.journal.stage(
      {
        kind: "note",
        relativePath,
        expectedRevision,
        previousRevision: currentRevision,
        nextRevision: incomingRevision,
        noteId,
        createdAt: context.now().toISOString(),
      },
      currentBytes,
      input.bytes,
    )
  } catch (error) {
    await context.history.writeRecoveryDraft(noteId, input.bytes)
    throw error
  }
  await context.hooks.afterJournalStaged?.()
  try {
    entry = await context.journal.prepare(entry)
  } catch (error) {
    await context.history.writeRecoveryDraft(noteId, input.bytes)
    await context.journal.complete(entry)
    throw error
  }
  await context.hooks.afterPrepared?.()
  try {
    entry = await context.journal.commit(entry)
  } catch (error) {
    if (error instanceof CollectionJournalError && error.kind === "target_changed") {
      const changedBytes = await optionalRead(resolved.path)
      const changedRevision = changedBytes ? revisionOf(changedBytes) : null
      const conflict = await context.history.recordConflict({
        noteId,
        relativePath,
        currentBytes: changedBytes,
        incomingBytes: input.bytes,
        currentRevision: changedRevision,
        incomingRevision,
      })
      await context.journal.complete(entry)
      return {
        kind: "conflict",
        conflictId: conflict.conflictId,
        currentRevision: changedRevision,
        incomingRevision,
      }
    }
    await context.history.writeRecoveryDraft(noteId, input.bytes)
    const changedBytes = await optionalRead(resolved.path)
    if ((changedBytes ? revisionOf(changedBytes) : null) === currentRevision) {
      await context.journal.complete(entry)
    }
    throw error
  }
  await context.hooks.afterRename?.()
  const note = { noteId, relativePath, revision: incomingRevision, bytes: input.bytes }
  if (input.acknowledge) {
    try {
      await input.acknowledge(note)
    } catch (error) {
      if (error instanceof Error) {
        return { kind: "metadata_pending", operationId: entry.operationId, note }
      }
      throw error
    }
  }
  await context.journal.complete(entry)
  return { kind: "saved", note }
}

export async function writeAssetNow(
  context: CollectionWriteContext,
  input: { readonly bytes: Uint8Array; readonly extension: string },
): Promise<AssetFile> {
  const extension = input.extension.replace(/^\./, "").toLocaleLowerCase("en-US")
  if (!/^[a-z0-9]{1,16}$/.test(extension)) throw new CollectionFileError("invalid_collection")
  const revision = revisionOf(input.bytes)
  const relativePath = assetRelativePathSchema.parse(`assets/${revision}.${extension}`)
  const resolved = await resolveCollectionPath(context.root, relativePath)
  const current = await optionalRead(resolved.path)
  if (current) {
    if (revisionOf(current) !== revision) throw new CollectionFileError("asset_collision")
    return { relativePath, revision }
  }
  let entry = await context.journal.stage(
    {
      kind: "asset",
      relativePath,
      expectedRevision: null,
      previousRevision: null,
      nextRevision: revision,
      noteId: null,
      createdAt: context.now().toISOString(),
    },
    null,
    input.bytes,
  )
  entry = await context.journal.prepare(entry)
  try {
    entry = await context.journal.commit(entry)
  } catch (error) {
    if (error instanceof CollectionJournalError && error.kind === "target_changed") {
      await context.journal.complete(entry)
      throw new CollectionFileError("asset_collision", error)
    }
    throw error
  }
  await context.journal.complete(entry)
  return { relativePath, revision }
}
