import { randomUUID } from "node:crypto"
import { mkdir, rename } from "node:fs/promises"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { noteIdSchema } from "../shared/collectionSchemas"
import type { KnowledgeNode, KnowledgeNodeId } from "../shared/knowledgeSchemas"
import { knowledgeNodeIdSchema } from "../shared/knowledgeSchemas"
import type { CreateNodeInput, NodeFilter, UpdateNodeInput } from "../shared/knowledgeTypes"
import type { BoardCard } from "../shared/schemas"
import type { AssetFile, NoteFile, SaveNoteResult } from "./collectionFiles"
import {
  CollectionFiles,
  createCanonicalNoteBytes,
  initialNoteRelativePath,
} from "./collectionFiles"
import { readCanonicalNoteBody, replaceCanonicalNoteBody } from "./collectionFrontmatter"
import { CollectionIndex } from "./collectionIndex"
import { revisionOf } from "./collectionJournal"
import { collectionMetadataFile, resolveCollectionPath } from "./collectionPaths"
import { CollectionReconciler } from "./collectionReconciler"
import { CollectionNoteConflictError } from "./collectionServiceErrors"
import type { CollectionChangeListener, CollectionServiceStatus } from "./collectionServiceTypes"
import { syncCollectionWorkspaceNotes } from "./collectionWorkspaceNotes"
import { openKnowledgeDatabase } from "./knowledgeDatabase"
import { KnowledgeRepository } from "./knowledgeRepository"

export { CollectionNoteConflictError } from "./collectionServiceErrors"
export type {
  CollectionChangeEvent,
  CollectionChangeListener,
  CollectionServiceStatus,
} from "./collectionServiceTypes"

export class CollectionService {
  private constructor(
    readonly files: CollectionFiles,
    readonly index: CollectionIndex,
    readonly repository: KnowledgeRepository,
    private readonly reconciler: CollectionReconciler,
  ) {}

  static async open(collectionRoot: string, indexFile: string): Promise<CollectionService> {
    const files = await CollectionFiles.open(collectionRoot)
    let index: CollectionIndex | null = null
    let db: DatabaseSync | null = null
    try {
      index = new CollectionIndex(indexFile)
      db = openKnowledgeDatabase(collectionMetadataFile(files.root))
      const repository = new KnowledgeRepository(db, index)
      const reconciler = new CollectionReconciler(files, index, repository)
      const service = new CollectionService(files, index, repository, reconciler)
      await reconciler.initialize()
      return service
    } catch (error) {
      db?.close()
      index?.close()
      await files.close()
      throw error
    }
  }

  async close(): Promise<void> {
    try {
      await this.files.close()
    } finally {
      try {
        this.index.close()
      } finally {
        this.repository.db.close()
      }
    }
  }

  get collectionRoot(): string {
    return this.files.root
  }

  get history() {
    return this.files.history
  }

  subscribe(listener: CollectionChangeListener): () => void {
    return this.reconciler.subscribe(listener)
  }

  findNodes(filter?: NodeFilter): readonly KnowledgeNode[] {
    return this.repository.findNodes(filter)
  }

  getNode(id: KnowledgeNodeId): KnowledgeNode | null {
    return this.repository.getNode(id)
  }

  async createNode(input: CreateNodeInput): Promise<KnowledgeNode> {
    if (input.kind !== "note") return this.repository.createNode(input)
    const id = input.id ?? knowledgeNodeIdSchema.parse(randomUUID())
    const bytes = createCanonicalNoteBytes(id, input.body ?? "")
    const result = await this.files.saveNote({
      relativePath: initialNoteRelativePath(id),
      bytes,
      expectedRevision: null,
      reason: "explicit_save",
      acknowledge: async (note) => {
        this.repository.withCanonicalNoteWrite(() => this.repository.createNode({ ...input, id }))
        this.index.upsert(note, { title: input.title, aliases: input.aliases ?? [] })
      },
    })
    this.savedResult(result)
    return this.requireNode(id)
  }

  async updateNode(input: UpdateNodeInput): Promise<KnowledgeNode> {
    const existing = this.requireNode(input.id)
    if (existing.kind !== "note") return this.repository.updateNode(input)
    const indexed = await this.requireIndexed(input.id)
    const current = await this.files.readNote(indexed.relativePath)
    const currentBody = readCanonicalNoteBody(current.bytes)
    if (input.expectedBody !== undefined && input.expectedBody !== currentBody) {
      if (input.body === undefined) throw new CollectionNoteConflictError(null)
      const incomingBytes = replaceCanonicalNoteBody(current.bytes, input.body)
      const conflict = await this.files.history.recordConflict({
        noteId: current.noteId,
        relativePath: current.relativePath,
        currentBytes: current.bytes,
        incomingBytes,
        currentRevision: current.revision,
        incomingRevision: revisionOf(incomingBytes),
      })
      throw new CollectionNoteConflictError(conflict.conflictId)
    }
    if (input.body === undefined || input.body === currentBody) {
      this.repository.withCanonicalNoteWrite(() => this.repository.updateNode(input))
      this.index.upsert(current, {
        title: input.title ?? existing.title,
        aliases: input.aliases ?? existing.aliases,
      })
      return this.requireNode(input.id)
    }
    const result = await this.files.saveNote({
      relativePath: current.relativePath,
      bytes: replaceCanonicalNoteBody(current.bytes, input.body),
      expectedRevision: current.revision,
      reason: "explicit_save",
      acknowledge: async (note) => {
        this.repository.withCanonicalNoteWrite(() => this.repository.updateNode(input))
        const metadata = this.requireNode(input.id)
        this.index.upsert(note, { title: metadata.title, aliases: metadata.aliases })
      },
    })
    this.savedResult(result)
    return this.requireNode(input.id)
  }

  async deleteNode(id: KnowledgeNodeId): Promise<boolean> {
    const node = this.repository.getNode(id)
    if (node?.kind !== "note") return this.repository.deleteNode(id)
    const indexed = await this.requireIndexed(id)
    const current = await this.files.readNote(indexed.relativePath)
    await this.files.history.recordSnapshot({
      noteId: current.noteId,
      bytes: current.bytes,
      reason: "close",
    })
    const source = await resolveCollectionPath(this.files.root, current.relativePath)
    const recovery = join(this.files.root, ".ohmypaper", "recovery")
    await mkdir(recovery, { recursive: true })
    await rename(source.path, join(recovery, `deleted-${current.noteId}-${current.revision}.md`))
    this.index.remove(current.noteId)
    return this.repository.withCanonicalNoteWrite(() => this.repository.deleteNode(id))
  }

  async rescan(): Promise<readonly NoteFile[]> {
    return await this.reconciler.rescan()
  }

  async status(): Promise<CollectionServiceStatus> {
    return await this.reconciler.status()
  }

  async restore(noteId: string, snapshotId: string, expectedRevision: string): Promise<NoteFile> {
    const indexed = await this.requireIndexed(noteId)
    const bytes = await this.files.history.readSnapshot(noteId, snapshotId)
    const result = await this.files.saveNote({
      relativePath: indexed.relativePath,
      bytes,
      expectedRevision,
      reason: "restore",
      acknowledge: async (note) => {
        const node = this.requireNode(knowledgeNodeIdSchema.parse(note.noteId))
        this.index.upsert(note, { title: node.title, aliases: node.aliases })
      },
    })
    return this.savedResult(result).note
  }

  async writeAsset(bytes: Uint8Array, extension: string): Promise<AssetFile> {
    return await this.files.writeAsset({ bytes, extension })
  }

  async syncWorkspaceNotes(
    cards: readonly BoardCard[],
    baselineCards?: readonly BoardCard[],
  ): Promise<void> {
    await syncCollectionWorkspaceNotes(
      this.files,
      this.index,
      this.repository,
      cards,
      baselineCards,
    )
  }

  private requireNode(id: KnowledgeNodeId): KnowledgeNode {
    const node = this.repository.getNode(id)
    if (!node) throw new Error(`Node not found: ${id}`)
    return node
  }

  private async requireIndexed(id: string) {
    let indexed = this.index.get(noteIdSchema.parse(id))
    if (!indexed) {
      await this.rescan()
      indexed = this.index.get(noteIdSchema.parse(id))
    }
    if (!indexed) throw new Error(`Canonical note missing: ${id}`)
    return indexed
  }

  private savedResult(result: SaveNoteResult): Extract<SaveNoteResult, { readonly kind: "saved" }> {
    if (result.kind === "conflict") throw new CollectionNoteConflictError(result.conflictId)
    if (result.kind === "metadata_pending")
      throw new Error(`Note saved; metadata recovery pending: ${result.operationId}`)
    return result
  }
}
