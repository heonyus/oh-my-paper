import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { DocumentId, DocumentRecord, Workspace } from "../shared/schemas"
import { workspaceSchema } from "../shared/schemas"
import { CollectionService } from "./collectionService"
import { replaceFile } from "./fileReplace"
import {
  closeKnowledgeDatabase,
  openKnowledgeDatabase,
  optimizeKnowledgeDatabase,
} from "./knowledgeDatabase"
import { markProjectionSource, migrateLegacyWorkspaceIfPresent } from "./knowledgeLegacyMigration"
import { KnowledgeRepository } from "./knowledgeRepository"
import { mergeWorkspaceForSave } from "./knowledgeWorkspaceMerge"
import { syncWorkspaceToRepository } from "./knowledgeWorkspaceSync"
import { forgetLearningFiles, saveLearningFiles } from "./learningFiles"
import { removeDocumentFromRepository } from "./workspaceDocumentDeletion"
import { readLibraryDocument, readLibraryDocuments } from "./workspaceDocuments"
import { WorkspaceFiles } from "./workspaceFiles"
import { WorkspaceProjectionCache } from "./workspaceProjectionCache"
import { WorkspaceSnapshots } from "./workspaceSnapshots"

export { defaultWorkspace } from "./workspaceDefaults"

const persistedWorkspaceSchema = workspaceSchema.extend({ layoutVersion: z.literal(2) })

export class WorkspaceStore {
  readonly workspaceFile: string
  readonly databaseFile: string
  readonly documentsDirectory: string
  readonly db: DatabaseSync
  readonly repository: KnowledgeRepository
  private saveQueue: Promise<void> = Promise.resolve()
  private migrated = false
  private readonly snapshots = new WorkspaceSnapshots()
  private readonly projections: WorkspaceProjectionCache
  private readonly files: WorkspaceFiles
  readonly collectionService: CollectionService | null

  constructor(
    readonly root: string,
    collectionService: CollectionService | null = null,
  ) {
    this.collectionService = collectionService
    this.workspaceFile = collectionService
      ? join(root, ".ohmypaper", "workspace-projection.json")
      : join(root, "workspace.json")
    this.databaseFile = collectionService
      ? join(root, ".ohmypaper", "metadata.sqlite")
      : join(root, "knowledge.sqlite")
    this.documentsDirectory = join(root, collectionService ? "papers" : "documents")
    this.db = collectionService?.repository.db ?? openKnowledgeDatabase(this.databaseFile)
    this.repository = collectionService?.repository ?? new KnowledgeRepository(this.db)
    this.migrated = collectionService !== null
    // Collection note bodies are read from the note index, a separate database.
    const databases = collectionService ? [this.db, collectionService.index.db] : [this.db]
    this.projections = new WorkspaceProjectionCache(this.repository, databases)
    this.files = new WorkspaceFiles(root)
  }

  static async openCollection(collectionRoot: string, indexFile: string): Promise<WorkspaceStore> {
    return new WorkspaceStore(
      collectionRoot,
      await CollectionService.open(collectionRoot, indexFile),
    )
  }

  get collection(): CollectionService | null {
    return this.collectionService
  }

  async initialize(): Promise<void> {
    await this.ensureMigrated()
    await this.collectionService?.rescan()
  }

  async close(): Promise<void> {
    await this.flush()
    if (this.collectionService) {
      optimizeKnowledgeDatabase(this.db)
      await this.collectionService.close()
      return
    }
    closeKnowledgeDatabase(this.db)
  }

  private async ensureMigrated(): Promise<void> {
    if (this.migrated) return
    await migrateLegacyWorkspaceIfPresent(this.workspaceFile, this.repository, this.db)
    this.migrated = true
  }

  /** The acknowledged workspace; unchanged databases and files return the same frozen object. */
  async read(): Promise<Workspace> {
    await this.ensureMigrated()
    await this.collectionService?.rescan()
    const agentThreads = await this.files.agentThreads()
    const readerNotes = await this.files.readerNotes()
    const workspace = this.projections.acknowledge(
      this.projections.readable(),
      agentThreads,
      readerNotes,
    )
    this.snapshots.remember(workspace)
    return workspace
  }

  /** The library record for `id` without projecting the whole workspace; null when absent. */
  async findDocument(id: DocumentId): Promise<DocumentRecord | null> {
    await this.ensureMigrated()
    await this.collectionService?.rescan()
    return readLibraryDocument(this.db, id)
  }

  /** Every library record, without the cards, insights, notes and threads `read` projects. */
  async listDocuments(): Promise<readonly DocumentRecord[]> {
    await this.ensureMigrated()
    await this.collectionService?.rescan()
    return readLibraryDocuments(this.db)
  }

  async save(workspace: Workspace): Promise<Workspace> {
    const parsed = workspaceSchema.parse(workspace)
    return this.enqueue(async () => {
      await this.ensureMigrated()
      await this.collectionService?.rescan()
      const current = this.projections.current()
      this.snapshots.remember(
        this.projections.acknowledge(current, current.agentThreads, current.readerNotes),
      )
      const base = this.snapshots.baseFor(parsed, current)
      const hasRendererBaseline =
        (parsed.baseSnapshotToken ?? parsed.snapshotToken) !== undefined ||
        (parsed.baseRevision ?? parsed.revision) !== undefined
      const effective = mergeWorkspaceForSave(base, current, parsed)
      this.repository.withCanonicalNoteWrite(() =>
        syncWorkspaceToRepository(this.repository, this.db, parsed, base, false),
      )
      await this.collectionService?.syncWorkspaceNotes(
        effective.cards,
        hasRendererBaseline ? base.cards : undefined,
      )
      await this.files.saveAgentThreads(parsed.agentThreads)
      const readerNotes = await this.files.readerNotes()
      await saveLearningFiles(this.root, base, parsed, { readerNotes })
      const savedWs = await this.acknowledgeRepository()
      return { ...savedWs, agentThreads: parsed.agentThreads }
    })
  }

  async flush(): Promise<void> {
    await this.saveQueue
  }

  async addDocument(
    document: DocumentRecord,
  ): Promise<{ readonly document: DocumentRecord; readonly duplicate: boolean }> {
    return this.enqueue(async () => {
      await this.ensureMigrated()
      const existingVersions = this.repository.findDocumentVersionsByHash(document.hash)
      if (existingVersions.length > 0) {
        const workspace = await this.read()
        const existing = workspace.documents.find((d) => d.hash === document.hash)
        if (existing) return { document: existing, duplicate: true }
      }

      const workspace = await this.read()
      const updated: Workspace = {
        ...workspace,
        documents: [...workspace.documents, document],
        activeDocumentId: document.id,
      }
      this.repository.withCanonicalNoteWrite(() =>
        syncWorkspaceToRepository(this.repository, this.db, updated, undefined, false),
      )
      await this.collectionService?.syncWorkspaceNotes(updated.cards, workspace.cards)
      await this.acknowledgeRepository()
      return { document, duplicate: false }
    })
  }

  /** Deletes a document record; returns it, or null when it is not in the library. */
  async deleteDocument(id: DocumentId): Promise<DocumentRecord | null> {
    if (this.collectionService) {
      throw new Error("Document deletion is not available for collection libraries")
    }
    return this.enqueue(async () => {
      await this.ensureMigrated()
      const current = this.projections.current()
      const removed = this.repository.withCanonicalNoteWrite(() =>
        removeDocumentFromRepository(this.repository, this.db, current, id),
      )
      if (removed) {
        await forgetLearningFiles(this.root, id)
        await this.acknowledgeRepository()
      }
      return removed
    })
  }

  /** Serializes a mutation behind earlier saves; a failure does not block later ones. */
  private enqueue<T>(mutation: () => Promise<T>): Promise<T> {
    const operation = this.saveQueue.catch(() => undefined).then(mutation)
    this.saveQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  /** Projects the committed repository, remembers it as a save base, and mirrors it to disk. */
  private async acknowledgeRepository(): Promise<Workspace> {
    const projection = this.projections.current()
    const savedWs = this.projections.acknowledge(
      projection,
      projection.agentThreads,
      await this.files.readerNotes(),
    )
    this.snapshots.remember(savedWs)
    if (!this.collectionService) await this.writeProjection(savedWs)
    return savedWs
  }

  private async writeProjection(workspace: Workspace): Promise<void> {
    const parsed = workspaceSchema.parse(workspace)
    const persisted = persistedWorkspaceSchema.parse({ ...parsed, layoutVersion: 2 })
    markProjectionSource(this.db, this.workspaceFile, parsed.documents.length + parsed.cards.length)
    const temporaryFile = `${this.workspaceFile}.tmp`
    await mkdir(this.root, { recursive: true })
    await writeFile(temporaryFile, JSON.stringify(persisted), {
      encoding: "utf8",
      mode: 0o600,
    })
    await replaceFile(temporaryFile, this.workspaceFile)
  }
}
