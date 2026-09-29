import { constants, type Stats } from "node:fs"
import { chmod, copyFile, readFile, stat } from "node:fs/promises"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { Workspace } from "../shared/schemas"
import { boardCardSchema, sourceAnchorSchema, workspaceSchema } from "../shared/schemas"
import { researchSidebarLayout } from "../shared/uiLayout"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { countRowSchema } from "./knowledgeRepositoryRows"
import { cachedStatement } from "./knowledgeStatements"
import { syncWorkspaceToRepository } from "./knowledgeWorkspaceSync"

const legacySourceAnchorSchema = sourceAnchorSchema.omit({ fragments: true }).strict()
const legacyBoardCardSchema = boardCardSchema.extend({ anchor: legacySourceAnchorSchema })
const legacyWorkspaceSchema = workspaceSchema.extend({ cards: legacyBoardCardSchema.array() })
const persistedWorkspaceSchema = workspaceSchema.extend({ layoutVersion: z.literal(2) })

export function parseLegacyWorkspace(value: unknown): Workspace {
  const persisted = persistedWorkspaceSchema.safeParse(value)
  if (persisted.success) return workspaceSchema.parse(persisted.data)
  const current = workspaceSchema.safeParse(value)
  if (current.success) {
    return {
      ...current.data,
      researchSidebarWidth:
        current.data.researchSidebarWidth === 340
          ? researchSidebarLayout.contentDefault
          : current.data.researchSidebarWidth,
    }
  }
  const legacy = legacyWorkspaceSchema.parse(value)
  return workspaceSchema.parse({
    ...legacy,
    researchSidebarWidth:
      legacy.researchSidebarWidth === 340
        ? researchSidebarLayout.contentDefault
        : legacy.researchSidebarWidth,
    cards: legacy.cards.map((card) => ({
      ...card,
      anchor: {
        ...card.anchor,
        fragments: [],
      },
    })),
  })
}

/**
 * Records that `sourceFile` is this store's own projection mirror, so opening the store never
 * imports it as legacy data. One stable row per file; later calls leave it unchanged.
 */
export function markProjectionSource(
  db: DatabaseSync,
  sourceFile: string,
  nodeCount: number,
): void {
  cachedStatement(
    db,
    `INSERT OR IGNORE INTO legacy_migration_markers (id, migrated_at, source_file, node_count)
     VALUES (?, ?, ?, ?)`,
  ).run(`projection:${sourceFile}`, new Date().toISOString(), sourceFile, nodeCount)
}

export async function migrateLegacyWorkspaceIfPresent(
  workspaceFile: string,
  repo: KnowledgeRepository,
  db: DatabaseSync,
): Promise<boolean> {
  const rawMarker = db
    .prepare("SELECT count(1) AS count FROM legacy_migration_markers WHERE source_file = ?")
    .get(workspaceFile)
  const parsedMarker = countRowSchema.safeParse(rawMarker)
  const count = parsedMarker.success ? parsedMarker.data.count : 0
  if (count > 0) {
    return false
  }

  let sourceStat: Stats | undefined
  try {
    sourceStat = await stat(workspaceFile)
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : ""
    if (code === "ENOENT") {
      return false
    }
    throw error
  }
  if (!sourceStat) return false

  const raw = await readFile(workspaceFile, "utf8")
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Failed to parse corrupt legacy workspace JSON: ${String(error)}`)
  }

  const workspace = parseLegacyWorkspace(parsedJson)

  const backupFile = `${workspaceFile}.backup-${Math.trunc(sourceStat.mtimeMs)}`
  try {
    await copyFile(workspaceFile, backupFile, constants.COPYFILE_EXCL)
    await chmod(backupFile, 0o600)
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : ""
    if (code !== "EEXIST") throw error
  }

  db.exec("BEGIN IMMEDIATE")
  try {
    syncWorkspaceToRepository(repo, db, workspace, undefined, true)
    const markerStmt = db.prepare(`
      INSERT INTO legacy_migration_markers (id, migrated_at, source_file, node_count)
      VALUES (?, ?, ?, ?)
    `)
    markerStmt.run(
      `mig-${Date.now()}`,
      new Date().toISOString(),
      workspaceFile,
      workspace.cards.length + workspace.documents.length,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }

  return true
}
