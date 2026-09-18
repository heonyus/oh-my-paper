import type { BoardCard } from "../shared/schemas"
import type { CollectionFiles, SaveNoteResult } from "./collectionFiles"
import { createCanonicalNoteBytes, initialNoteRelativePath } from "./collectionFiles"
import { readCanonicalNoteBody, replaceCanonicalNoteBody } from "./collectionFrontmatter"
import type { CollectionIndex } from "./collectionIndex"
import { revisionOf } from "./collectionJournal"
import { CollectionNoteConflictError } from "./collectionServiceErrors"
import type { KnowledgeRepository } from "./knowledgeRepository"

function requireSaved(result: SaveNoteResult): void {
  if (result.kind === "conflict") throw new CollectionNoteConflictError(result.conflictId)
  if (result.kind === "metadata_pending") {
    throw new Error(`Note saved; index recovery pending: ${result.operationId}`)
  }
}

export async function syncCollectionWorkspaceNotes(
  files: CollectionFiles,
  index: CollectionIndex,
  repository: KnowledgeRepository,
  cards: readonly BoardCard[],
  baselineCards?: readonly BoardCard[],
): Promise<void> {
  const board = repository.getOrCreateDefaultBoard()
  const placements = repository.findPlacementsForBoard(board.id)
  const baselineById = new Map(baselineCards?.map((card) => [card.id, card]))
  for (const card of cards) {
    const placement = placements.find((candidate) => candidate.cardId === card.id)
    if (!placement) continue
    const node = repository.getNode(placement.nodeId)
    if (node?.kind !== "note") continue
    const indexed = index.get(node.id)
    const current = indexed ? await files.readNote(indexed.relativePath) : null
    const currentBody = current ? readCanonicalNoteBody(current.bytes) : null
    if (current && currentBody === card.body) {
      index.upsert(current, { title: node.title, aliases: node.aliases })
      continue
    }
    const bytes = current
      ? replaceCanonicalNoteBody(current.bytes, card.body)
      : createCanonicalNoteBytes(node.id, card.body)
    const baseline = baselineById.get(card.id)
    if (current && (baseline === undefined || baseline.body !== currentBody)) {
      const conflict = await files.history.recordConflict({
        noteId: current.noteId,
        relativePath: current.relativePath,
        currentBytes: current.bytes,
        incomingBytes: bytes,
        currentRevision: current.revision,
        incomingRevision: revisionOf(bytes),
      })
      throw new CollectionNoteConflictError(conflict.conflictId)
    }
    const result = await files.saveNote({
      relativePath: current?.relativePath ?? initialNoteRelativePath(node.id),
      bytes,
      expectedRevision: current?.revision ?? null,
      reason: "explicit_save",
      acknowledge: async (note) => {
        index.upsert(note, { title: node.title, aliases: node.aliases })
      },
    })
    requireSaved(result)
  }
}
