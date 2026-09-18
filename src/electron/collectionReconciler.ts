import { basename } from "node:path"
import { type NoteId, noteIdSchema } from "../shared/collectionSchemas"
import { knowledgeNodeIdSchema } from "../shared/knowledgeSchemas"
import type { CollectionFiles, NoteFile } from "./collectionFiles"
import { readCanonicalNoteBody } from "./collectionFrontmatter"
import type { CollectionIndex, NoteIndexMetadata } from "./collectionIndex"
import type {
  CollectionChangeEvent,
  CollectionChangeListener,
  CollectionServiceStatus,
} from "./collectionServiceTypes"
import type { KnowledgeRepository } from "./knowledgeRepository"

export class CollectionReconciler {
  private missingNoteIds: readonly string[] = []
  private lastScanAt: string | null = null
  private lastError: string | null = null
  private scanQueue: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<CollectionChangeListener>()

  constructor(
    private readonly files: CollectionFiles,
    private readonly index: CollectionIndex,
    private readonly repository: KnowledgeRepository,
  ) {}

  subscribe(listener: CollectionChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async initialize(): Promise<void> {
    await this.files.recover()
    await this.rescan()
    for (const entry of await this.files.journal.entries()) {
      if (entry.state === "file_committed") await this.files.acknowledgeRecovery(entry.operationId)
    }
    this.index.rebuild(await this.files.scanNotes(), (noteId) => this.metadataFor(noteId))
  }

  async rescan(): Promise<readonly NoteFile[]> {
    const operation = this.scanQueue.then(async () => await this.rescanNow())
    this.scanQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
  }

  private async rescanNow(): Promise<readonly NoteFile[]> {
    try {
      const notes = await this.files.scanNotes()
      const previous = new Map(this.index.list().map((note) => [note.noteId, note]))
      const present = new Set(notes.map((note) => note.noteId))
      const changed = notes
        .filter((note) => {
          const indexed = previous.get(note.noteId)
          return indexed?.revision !== note.revision || indexed.relativePath !== note.relativePath
        })
        .map((note) => note.noteId)
      for (const note of notes) await this.projectNote(note)
      this.missingNoteIds = this.allMetadataNoteIds().filter(
        (id) => !present.has(noteIdSchema.parse(id)),
      )
      for (const id of this.missingNoteIds) this.index.remove(id)
      this.lastScanAt = new Date().toISOString()
      this.lastError = null
      this.emit(changed)
      return notes
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Collection rescan failed"
      throw error
    }
  }

  async status(): Promise<CollectionServiceStatus> {
    const conflicts = (await this.files.history.listConflicts()).filter(
      (conflict) => conflict.status === "unresolved",
    )
    return {
      state:
        this.lastError || conflicts.length > 0 || this.missingNoteIds.length > 0
          ? "degraded"
          : "ready",
      indexComplete: this.index.isComplete(),
      reliabilityWarning: this.files.reliabilityWarning,
      missingNoteIds: this.missingNoteIds,
      unresolvedConflictIds: conflicts.map((conflict) => conflict.conflictId),
      lastScanAt: this.lastScanAt,
      error: this.lastError,
    }
  }

  private async projectNote(note: NoteFile): Promise<void> {
    const previous = this.index.get(note.noteId)
    if (previous?.revision === note.revision && previous.relativePath === note.relativePath) return
    if (previous) {
      await this.files.history.recordSnapshot({
        noteId: note.noteId,
        bytes: previous.bytes,
        reason: "external_change",
      })
    }
    const id = knowledgeNodeIdSchema.parse(note.noteId)
    let node = this.repository.getNode(id)
    if (!node) {
      const body = readCanonicalNoteBody(note.bytes)
      node = this.repository.withCanonicalNoteWrite(() =>
        this.repository.createNode({ id, kind: "note", title: this.titleFor(note, body), body }),
      )
    }
    this.index.upsert(note, { title: node.title, aliases: node.aliases })
  }

  private metadataFor(noteId: NoteId): NoteIndexMetadata {
    const node = this.repository.getNode(knowledgeNodeIdSchema.parse(noteId))
    return node ? { title: node.title, aliases: node.aliases } : { title: noteId, aliases: [] }
  }

  private allMetadataNoteIds(): readonly string[] {
    const ids: string[] = []
    let offset = 0
    while (true) {
      const page = this.repository.findNodes({ kind: "note", limit: 100, offset })
      ids.push(...page.map((node) => node.id))
      if (page.length < 100) return ids
      offset += page.length
    }
  }

  private titleFor(note: NoteFile, body: string): string {
    return body.match(/^#\s+(.+)$/m)?.[1]?.trim() || basename(note.relativePath, ".md")
  }

  private emit(changedNoteIds: readonly string[]): void {
    if (!this.lastScanAt || (changedNoteIds.length === 0 && this.missingNoteIds.length === 0))
      return
    const event: CollectionChangeEvent = {
      kind: "notes_reconciled",
      changedNoteIds,
      removedNoteIds: this.missingNoteIds,
      scannedAt: this.lastScanAt,
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : "Collection listener failed"
      }
    }
  }
}
