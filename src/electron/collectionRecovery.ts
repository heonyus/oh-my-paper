import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { CollectionJournalEntry, CollectionRevision } from "../shared/collectionSchemas"
import { noteRelativePathSchema } from "../shared/collectionSchemas"
import type { CollectionJournal } from "./collectionJournal"
import { CollectionJournalError, revisionOf } from "./collectionJournal"
import type { NoteHistory } from "./noteHistory"

export type CollectionRecoveryResult =
  | {
      readonly kind: "metadata_pending"
      readonly operationId: string
      readonly relativePath: string
      readonly revision: CollectionRevision
    }
  | {
      readonly kind: "conflict"
      readonly operationId: string
      readonly relativePath: string
      readonly conflictId: string | null
    }

async function optionalBytes(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}

function revisionOrNull(bytes: Uint8Array | null): CollectionRevision | null {
  return bytes ? revisionOf(bytes) : null
}

async function commitPrepared(
  journal: CollectionJournal,
  entry: CollectionJournalEntry,
  temporaryBytes: Uint8Array | null,
): Promise<CollectionJournalEntry> {
  let prepared = entry
  if (!temporaryBytes) {
    prepared = await journal.prepare(entry)
  } else if (entry.state === "staged") {
    prepared = await journal.update(entry, "prepared")
  }
  if (prepared.state === "file_committed") return prepared
  return await journal.commit(prepared)
}

async function retainRecoveryConflict(
  journal: CollectionJournal,
  history: NoteHistory,
  entry: CollectionJournalEntry,
  currentBytes: Uint8Array | null,
  incomingBytes: Uint8Array,
): Promise<CollectionRecoveryResult> {
  let conflictId: string | null = null
  if (entry.kind === "note" && entry.noteId) {
    const conflict = await history.recordConflict({
      noteId: entry.noteId,
      relativePath: noteRelativePathSchema.parse(entry.relativePath),
      currentBytes,
      incomingBytes,
      currentRevision: revisionOrNull(currentBytes),
      incomingRevision: entry.nextRevision,
    })
    conflictId = conflict.conflictId
    await journal.complete(entry)
  }
  return {
    kind: "conflict",
    operationId: entry.operationId,
    relativePath: entry.relativePath,
    conflictId,
  }
}

export async function recoverCollectionJournal(
  root: string,
  journal: CollectionJournal,
  history: NoteHistory,
): Promise<readonly CollectionRecoveryResult[]> {
  const results: CollectionRecoveryResult[] = []
  for (const entry of await journal.entries()) {
    const targetBytes = await optionalBytes(join(root, entry.relativePath))
    const targetRevision = revisionOrNull(targetBytes)
    const incomingBytes = await readFile(join(root, entry.incomingRelativePath))
    if (revisionOf(incomingBytes) !== entry.nextRevision) {
      results.push(
        await retainRecoveryConflict(journal, history, entry, targetBytes, incomingBytes),
      )
      continue
    }
    if (targetRevision === entry.nextRevision) {
      const committed =
        entry.state === "file_committed" ? entry : await journal.update(entry, "file_committed")
      results.push({
        kind: "metadata_pending",
        operationId: committed.operationId,
        relativePath: committed.relativePath,
        revision: committed.nextRevision,
      })
      continue
    }
    if (targetRevision !== entry.previousRevision) {
      results.push(
        await retainRecoveryConflict(journal, history, entry, targetBytes, incomingBytes),
      )
      continue
    }
    const temporaryBytes = await optionalBytes(join(root, entry.temporaryRelativePath))
    if (temporaryBytes && revisionOf(temporaryBytes) !== entry.nextRevision) {
      results.push(
        await retainRecoveryConflict(journal, history, entry, targetBytes, incomingBytes),
      )
      continue
    }
    let committed: CollectionJournalEntry
    try {
      committed = await commitPrepared(journal, entry, temporaryBytes)
    } catch (error) {
      if (error instanceof CollectionJournalError && error.kind === "target_changed") {
        const changedBytes = await optionalBytes(join(root, entry.relativePath))
        results.push(
          await retainRecoveryConflict(journal, history, entry, changedBytes, incomingBytes),
        )
        continue
      }
      throw error
    }
    results.push({
      kind: "metadata_pending",
      operationId: committed.operationId,
      relativePath: committed.relativePath,
      revision: committed.nextRevision,
    })
  }
  return results
}

export async function acknowledgeRecoveredEntry(
  root: string,
  journal: CollectionJournal,
  operationId: string,
): Promise<void> {
  const entry = await journal.find(operationId)
  if (!entry) return
  const target = await readFile(join(root, entry.relativePath))
  if (revisionOf(target) !== entry.nextRevision) {
    throw new Error(`Recovery target changed: ${entry.relativePath}`)
  }
  const committed =
    entry.state === "file_committed" ? entry : await journal.update(entry, "file_committed")
  await journal.complete(committed)
}
