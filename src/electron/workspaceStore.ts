import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { DocumentId, DocumentRecord, Workspace } from "../shared/schemas"
import { workspaceSchema } from "../shared/schemas"
import { researchSidebarLayout } from "../shared/uiLayout"
import { readAgentThreads, writeAgentThreads } from "./agentThreadsFile"
import { CollectionService } from "./collectionService"
import { openKnowledgeDatabase } from "./knowledgeDatabase"
import { migrateLegacyWorkspaceIfPresent } from "./knowledgeLegacyMigration"
import { KnowledgeRepository } from "./knowledgeRepository"
import { countRowSchema } from "./knowledgeRepositoryRows"
import { mergeWorkspaceForSave, WorkspaceConflictError } from "./knowledgeWorkspaceMerge"
import { projectRepositoryToWorkspace } from "./knowledgeWorkspaceProjection"
import { syncWorkspaceToRepository } from "./knowledgeWorkspaceSync"
import { forgetOwnSummary, readOwnSummaries, saveOwnSummaries } from "./ownSummariesFile"
import { removeDocumentFromRepository } from "./workspaceDocumentDeletion"
import { acknowledgedWorkspace } from "./workspaceSnapshot"

const persistedWorkspaceSchema = workspaceSchema.extend({ layoutVersion: z.literal(2) })

export function defaultWorkspace(): Workspace {
  return {
    documents: [],
    cards: [],
    agentThreads: [],
    insights: [],
    ownSummaries: [],
    sidebarOpen: true,
    outlineWidth: 240,
    researchSidebarWidth: researchSidebarLayout.contentDefault,
    uiFontFamily: "wanted",
    uiFontScale: 1,
    theme: "system",
    minimapVisible: true,
    viewport: { x: 88, y: 36, zoom: 0.9 },
    activeDocumentId: null,
  }
}

export class WorkspaceStore {
  readonly workspaceFile: string
  readonly databaseFile: string
  readonly documentsDirectory: string
  readonly db: DatabaseSync
  readonly repository: KnowledgeRepository
  private saveQueue: Promise<void> = Promise.resolve()
  private migrated = false
  private readonly snapshots = new Map<string, Workspace>()
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
      await this.collectionService.close()
      return
    }
    this.db.close()
  }

  private async ensureMigrated(): Promise<void> {
    if (this.migrated) return
    await migrateLegacyWorkspaceIfPresent(this.workspaceFile, this.repository, this.db)
    this.migrated = true
  }

  async read(): Promise<Workspace> {
    await this.ensureMigrated()
    await this.collectionService?.rescan()
    const agentThreads = await readAgentThreads(this.root)
    const ownSummaries = await readOwnSummaries(this.root)
    const rawSettings = this.db.prepare("SELECT COUNT(*) as count FROM workspace_settings").get()
    const rawNodes = this.db.prepare("SELECT COUNT(*) as count FROM knowledge_nodes").get()
    const settingsCount = countRowSchema.parse(rawSettings).count
    const nodeCount = countRowSchema.parse(rawNodes).count

    if (settingsCount === 0 && nodeCount === 0) {
      const def = acknowledgedWorkspace({ ...defaultWorkspace(), agentThreads, ownSummaries })
      this.rememberSnapshot(def)
      return def
    }
    const ws = acknowledgedWorkspace({
      ...projectRepositoryToWorkspace(this.repository, this.db),
      agentThreads,
      ownSummaries,
    })
    this.rememberSnapshot(ws)
    return ws
  }

  private rememberSnapshot(workspace: Workspace): void {
    const snapshot = acknowledgedWorkspace(workspace)
    const token = snapshot.snapshotToken
    if (!token) throw new Error("Workspace snapshot token missing")
    if (!this.snapshots.has(token)) this.snapshots.set(token, snapshot)
    while (this.snapshots.size > 8) {
      const oldest = this.snapshots.keys().next().value
      if (oldest === undefined) break
      this.snapshots.delete(oldest)
    }
  }

  async save(workspace: Workspace): Promise<Workspace> {
    const parsed = workspaceSchema.parse(workspace)
    return this.enqueue(async () => {
      await this.ensureMigrated()
      await this.collectionService?.rescan()
      const current = acknowledgedWorkspace(projectRepositoryToWorkspace(this.repository, this.db))
      this.rememberSnapshot(current)
      const baseRevision = parsed.baseRevision ?? parsed.revision
      const baseToken = parsed.baseSnapshotToken ?? parsed.snapshotToken
      const hasRendererBaseline = baseToken !== undefined || baseRevision !== undefined
      const base = baseToken
        ? this.snapshots.get(baseToken)
        : baseRevision === undefined
          ? current
          : [...this.snapshots.values()].filter((snapshot) => snapshot.revision === baseRevision)
                .length === 1
            ? [...this.snapshots.values()].find((snapshot) => snapshot.revision === baseRevision)
            : undefined
      if ((baseToken !== undefined || baseRevision !== undefined) && !base) {
        throw new WorkspaceConflictError(
          baseToken ? `baseSnapshotToken:${baseToken}` : `baseRevision:${baseRevision}`,
        )
      }
      const effective = base ? mergeWorkspaceForSave(base, current, parsed) : parsed
      this.repository.withCanonicalNoteWrite(() =>
        syncWorkspaceToRepository(
          this.repository,
          this.db,
          parsed,
          base,
          false,
          this.collectionService ? undefined : this.workspaceFile,
        ),
      )
      await this.collectionService?.syncWorkspaceNotes(
        effective.cards,
        hasRendererBaseline ? base?.cards : undefined,
      )
      await writeAgentThreads(this.root, parsed.agentThreads)
      await saveOwnSummaries(this.root, base?.ownSummaries, parsed.ownSummaries)
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
        syncWorkspaceToRepository(
          this.repository,
          this.db,
          updated,
          undefined,
          false,
          this.collectionService ? undefined : this.workspaceFile,
        ),
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
      const current = projectRepositoryToWorkspace(this.repository, this.db)
      const removed = this.repository.withCanonicalNoteWrite(() =>
        removeDocumentFromRepository(this.repository, this.db, current, id),
      )
      if (removed) {
        await forgetOwnSummary(this.root, id)
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
    const savedWs = acknowledgedWorkspace({
      ...projectRepositoryToWorkspace(this.repository, this.db),
      ownSummaries: await readOwnSummaries(this.root),
    })
    this.rememberSnapshot(savedWs)
    if (!this.collectionService) await this.writeProjection(savedWs)
    return savedWs
  }

  private async writeProjection(workspace: Workspace): Promise<void> {
    const parsed = workspaceSchema.parse(workspace)
    const persisted = persistedWorkspaceSchema.parse({ ...parsed, layoutVersion: 2 })
    const temporaryFile = `${this.workspaceFile}.tmp`
    await mkdir(this.root, { recursive: true })
    await writeFile(temporaryFile, JSON.stringify(persisted), {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(temporaryFile, this.workspaceFile)
  }
}
