import { randomUUID } from "node:crypto"
import { access, copyFile, mkdir, readFile, rename } from "node:fs/promises"
import { join } from "node:path"
import { backup, DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { activeCollectionPointerSchema, collectionIdSchema } from "../shared/collectionSchemas"
import { CollectionFiles, initializeCollection } from "./collectionFiles"
import { replaceDurably } from "./collectionJournal"
import { migrateCollectionContents } from "./collectionMigrationContent"
import { copyRegularTree, type MigrationCopy } from "./collectionMigrationCopies"
import { collectionIndexFile, collectionMetadataFile, collectionRootForId } from "./collectionPaths"
import { CollectionService } from "./collectionService"
import { parseLegacyWorkspace } from "./knowledgeLegacyMigration"

const countSchema = z.object({ count: z.number().int().nonnegative() })

export type CollectionMigrationPreview = {
  readonly collectionId: string
  readonly destinationRoot: string
  readonly noteCount: number
  readonly documentVersionCount: number
  readonly legacyWorkspacePresent: boolean
  readonly legacyDatabasePresent: boolean
}

export type CollectionMigrationResult = CollectionMigrationPreview & {
  readonly backupCopies: readonly MigrationCopy[]
  readonly missingPdfVersionIds: readonly string[]
  readonly activated: true
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}

function count(
  db: DatabaseSync,
  table: "knowledge_nodes" | "document_versions",
  where = "",
): number {
  return countSchema.parse(db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get())
    .count
}

export async function previewCollectionMigration(
  legacyRoot: string,
  userDataRoot: string,
  uncheckedCollectionId = randomUUID(),
): Promise<CollectionMigrationPreview> {
  const collectionId = collectionIdSchema.parse(uncheckedCollectionId)
  const databaseFile = join(legacyRoot, "knowledge.sqlite")
  const workspaceFile = join(legacyRoot, "workspace.json")
  const legacyDatabasePresent = await exists(databaseFile)
  const legacyWorkspacePresent = await exists(workspaceFile)
  let noteCount = 0
  let documentVersionCount = 0
  if (legacyDatabasePresent) {
    const db = new DatabaseSync(databaseFile, { readOnly: true })
    try {
      noteCount = count(db, "knowledge_nodes", "WHERE kind = 'note'")
      documentVersionCount = count(db, "document_versions")
    } finally {
      db.close()
    }
  } else if (legacyWorkspacePresent) {
    const workspace = parseLegacyWorkspace(JSON.parse(await readFile(workspaceFile, "utf8")))
    noteCount = workspace.cards.length
    documentVersionCount = workspace.documents.length
  }
  return {
    collectionId,
    destinationRoot: collectionRootForId(userDataRoot, collectionId),
    noteCount,
    documentVersionCount,
    legacyWorkspacePresent,
    legacyDatabasePresent,
  }
}

export async function migrateLegacyCollection(
  legacyRoot: string,
  userDataRoot: string,
  uncheckedCollectionId = randomUUID(),
): Promise<CollectionMigrationResult> {
  const preview = await previewCollectionMigration(legacyRoot, userDataRoot, uncheckedCollectionId)
  const active = await readActiveCollection(userDataRoot)
  if (active?.collectionId === preview.collectionId && (await exists(preview.destinationRoot))) {
    return { ...preview, backupCopies: [], missingPdfVersionIds: [], activated: true }
  }
  if (await exists(preview.destinationRoot))
    throw new Error("Collection destination already exists")
  const stagingRoot = `${preview.destinationRoot}.staging-${randomUUID()}`
  await mkdir(join(userDataRoot, "collections", preview.collectionId), { recursive: true })
  await initializeCollection(stagingRoot, preview.collectionId)
  const backupRoot = join(stagingRoot, ".scourgify", "migration-backup")
  await mkdir(backupRoot, { recursive: true })
  const backupCopies: MigrationCopy[] = []
  const sourceDatabase = join(legacyRoot, "knowledge.sqlite")
  const backupDatabase = join(backupRoot, "knowledge.sqlite")
  if (preview.legacyDatabasePresent) {
    const source = new DatabaseSync(sourceDatabase, { readOnly: true })
    try {
      await backup(source, backupDatabase)
    } finally {
      source.close()
    }
    await copyFile(backupDatabase, collectionMetadataFile(stagingRoot))
  }
  const sourceWorkspace = join(legacyRoot, "workspace.json")
  const backupWorkspace = join(backupRoot, "workspace.json")
  if (preview.legacyWorkspacePresent) await copyFile(sourceWorkspace, backupWorkspace)
  const sourceDocuments = join(legacyRoot, "documents")
  if (await exists(sourceDocuments)) {
    backupCopies.push(...(await copyRegularTree(sourceDocuments, join(backupRoot, "documents"))))
  }
  const migrated = await migrateCollectionContents(
    legacyRoot,
    stagingRoot,
    backupWorkspace,
    preview.legacyWorkspacePresent,
  )
  const validation = await CollectionFiles.open(stagingRoot)
  try {
    if ((await validation.scanNotes()).length !== migrated.noteCount)
      throw new Error("Migrated note count mismatch")
  } finally {
    await validation.close()
  }
  await replaceDurably(
    join(backupRoot, "manifest.json"),
    Buffer.from(
      `${JSON.stringify({ backupCopies, missingPdfVersionIds: migrated.missingPdfVersionIds }, null, 2)}\n`,
    ),
  )
  await rename(stagingRoot, preview.destinationRoot)
  const service = await CollectionService.open(
    preview.destinationRoot,
    collectionIndexFile(userDataRoot, preview.collectionId),
  )
  await service.close()
  await replaceDurably(
    join(userDataRoot, "active-collection.json"),
    Buffer.from(`${JSON.stringify({ schemaVersion: 1, collectionId: preview.collectionId })}\n`),
  )
  return {
    ...preview,
    backupCopies,
    missingPdfVersionIds: migrated.missingPdfVersionIds,
    activated: true,
  }
}

export async function readActiveCollection(userDataRoot: string) {
  const pointerPath = join(userDataRoot, "active-collection.json")
  if (!(await exists(pointerPath))) return null
  return activeCollectionPointerSchema.parse(JSON.parse(await readFile(pointerPath, "utf8")))
}
