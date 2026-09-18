import type { randomUUID } from "node:crypto"
import { access } from "node:fs/promises"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"
import { z } from "zod"
import {
  migrateLegacyCollection,
  previewCollectionMigration,
} from "../src/electron/collectionMigration"
import { collectionIndexFile, collectionMetadataFile } from "../src/electron/collectionPaths"
import { withKnowledgeSavepoint } from "../src/electron/knowledgeDatabaseTransaction"
import type { KnowledgeRepository } from "../src/electron/knowledgeRepository"
import { WorkspaceStore } from "../src/electron/workspaceStore"
import { collectionIdSchema } from "../src/shared/collectionSchemas"
import type { KnowledgeNode } from "../src/shared/knowledgeSchemas"

const boardTitle = "읽고 있는 논문"
const countSchema = z.object({ count: z.number().int().nonnegative() })

function migrationCollectionId(value: string): ReturnType<typeof randomUUID> {
  const parsed = collectionIdSchema.parse(value)
  const [first, second, third, fourth, fifth] = parsed.split("-")
  if (!first || !second || !third || !fourth || !fifth) {
    throw new LocalLibraryPreparationError("invalid_arguments")
  }
  return `${first}-${second}-${third}-${fourth}-${fifth}`
}

const preparationInputSchema = z.object({
  legacyRoot: z
    .string()
    .min(1)
    .transform((path) => resolve(path)),
  userDataRoot: z
    .string()
    .min(1)
    .transform((path) => resolve(path)),
  collectionId: z.string().transform(migrationCollectionId),
  apply: z.boolean(),
})

export type LocalLibraryPreparationInput = z.input<typeof preparationInputSchema>

export type LocalLibraryPreparationSummary = {
  readonly mode: "dry-run" | "applied"
  readonly noteCount: number
  readonly documentVersionCount: number
  readonly paperCount: number
  readonly boardCreateCount: number
  readonly placementCreateCount: number
  readonly missingPdfCount: number
}

export class LocalLibraryPreparationError extends Error {
  readonly name = "LocalLibraryPreparationError"

  constructor(readonly code: "ambiguous_board" | "non_paper_placement" | "invalid_arguments") {
    super(code)
  }
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

function databaseCounts(databaseFile: string): {
  readonly paperCount: number
  readonly boardCount: number
  readonly placedPaperCount: number
} {
  const db = new DatabaseSync(databaseFile, { readOnly: true })
  try {
    const paperCount = countSchema.parse(
      db.prepare("SELECT COUNT(*) AS count FROM knowledge_nodes WHERE kind = 'paper'").get(),
    ).count
    const boardCount = countSchema.parse(
      db.prepare("SELECT COUNT(*) AS count FROM boards WHERE title = ?").get(boardTitle),
    ).count
    const placedPaperCount = countSchema.parse(
      db
        .prepare(`SELECT COUNT(DISTINCT placements.node_id) AS count
          FROM placements
          JOIN boards ON boards.id = placements.board_id
          JOIN knowledge_nodes ON knowledge_nodes.id = placements.node_id
          WHERE boards.title = ? AND knowledge_nodes.kind = 'paper'`)
        .get(boardTitle),
    ).count
    return { paperCount, boardCount, placedPaperCount }
  } finally {
    db.close()
  }
}

function allPapers(repository: KnowledgeRepository): readonly KnowledgeNode[] {
  const papers: KnowledgeNode[] = []
  for (let offset = 0; ; offset += 100) {
    const page = repository.findNodes({ kind: "paper", limit: 100, offset })
    papers.push(...page)
    if (page.length < 100) return papers.sort((left, right) => left.id.localeCompare(right.id))
  }
}

function organizeReadingBoard(repository: KnowledgeRepository): {
  readonly paperCount: number
  readonly boardCreateCount: number
  readonly placementCreateCount: number
} {
  return withKnowledgeSavepoint(repository.db, () => {
    const matchingBoards = repository.listBoards().filter((board) => board.title === boardTitle)
    if (matchingBoards.length > 1) throw new LocalLibraryPreparationError("ambiguous_board")
    const existingBoard = matchingBoards[0]
    const board = existingBoard ?? repository.createBoard(boardTitle)
    const papers = allPapers(repository)
    const paperIds = new Set(papers.map((paper) => paper.id))
    const placements = repository.findPlacementsForBoard(board.id)
    if (placements.some((placement) => !paperIds.has(placement.nodeId))) {
      throw new LocalLibraryPreparationError("non_paper_placement")
    }
    const placed = new Set(placements.map((placement) => placement.nodeId))
    const missing = papers.filter((paper) => !placed.has(paper.id))
    for (const [index, paper] of missing.entries()) {
      repository.createPlacement({
        boardId: board.id,
        nodeId: paper.id,
        x: (index % 3) * 340,
        y: Math.floor(index / 3) * 240,
        zIndex: placements.length + index,
      })
    }
    return {
      paperCount: papers.length,
      boardCreateCount: existingBoard ? 0 : 1,
      placementCreateCount: missing.length,
    }
  })
}

export async function prepareLocalLibrary(
  rawInput: LocalLibraryPreparationInput,
): Promise<LocalLibraryPreparationSummary> {
  const input = preparationInputSchema.parse(rawInput)
  const preview = await previewCollectionMigration(
    input.legacyRoot,
    input.userDataRoot,
    input.collectionId,
  )
  const destinationDatabase = collectionMetadataFile(preview.destinationRoot)
  const legacyDatabase = resolve(input.legacyRoot, "knowledge.sqlite")
  const databaseFile = (await exists(destinationDatabase))
    ? destinationDatabase
    : (await exists(legacyDatabase))
      ? legacyDatabase
      : null
  const counts = databaseFile
    ? databaseCounts(databaseFile)
    : { paperCount: preview.documentVersionCount, boardCount: 0, placedPaperCount: 0 }
  if (counts.boardCount > 1) throw new LocalLibraryPreparationError("ambiguous_board")
  if (!input.apply) {
    return {
      mode: "dry-run",
      noteCount: preview.noteCount,
      documentVersionCount: preview.documentVersionCount,
      paperCount: counts.paperCount,
      boardCreateCount: counts.boardCount === 0 ? 1 : 0,
      placementCreateCount: Math.max(0, counts.paperCount - counts.placedPaperCount),
      missingPdfCount: 0,
    }
  }

  const migrated = await migrateLegacyCollection(
    input.legacyRoot,
    input.userDataRoot,
    input.collectionId,
  )
  const store = await WorkspaceStore.openCollection(
    migrated.destinationRoot,
    collectionIndexFile(input.userDataRoot, migrated.collectionId),
  )
  try {
    await store.initialize()
    const organized = organizeReadingBoard(store.repository)
    return {
      mode: "applied",
      noteCount: migrated.noteCount,
      documentVersionCount: migrated.documentVersionCount,
      ...organized,
      missingPdfCount: migrated.missingPdfVersionIds.length,
    }
  } finally {
    await store.close()
  }
}

function parseArguments(args: readonly string[]): LocalLibraryPreparationInput {
  const values: {
    legacyRoot?: string
    userDataRoot?: string
    collectionId?: string
    apply: boolean
  } = {
    apply: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    switch (argument) {
      case "--legacy-root": {
        const value = args[index + 1]
        if (!value) throw new LocalLibraryPreparationError("invalid_arguments")
        values.legacyRoot = value
        index += 1
        break
      }
      case "--user-data-root": {
        const value = args[index + 1]
        if (!value) throw new LocalLibraryPreparationError("invalid_arguments")
        values.userDataRoot = value
        index += 1
        break
      }
      case "--collection-id": {
        const value = args[index + 1]
        if (!value) throw new LocalLibraryPreparationError("invalid_arguments")
        values.collectionId = value
        index += 1
        break
      }
      case "--apply":
        values.apply = true
        break
      default:
        throw new LocalLibraryPreparationError("invalid_arguments")
    }
  }
  const parsed = preparationInputSchema.safeParse(values)
  if (!parsed.success) throw new LocalLibraryPreparationError("invalid_arguments")
  return parsed.data
}

async function runCli(): Promise<void> {
  try {
    const result = await prepareLocalLibrary(parseArguments(process.argv.slice(2)))
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.name : "UnknownError"}\n`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) void runCli()
