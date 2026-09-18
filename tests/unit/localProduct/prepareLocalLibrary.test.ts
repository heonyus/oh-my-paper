// @vitest-environment node
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { prepareLocalLibrary } from "../../../scripts/prepare-local-library"
import { readActiveCollection } from "../../../src/electron/collectionMigration"
import { collectionIndexFile, collectionRootForId } from "../../../src/electron/collectionPaths"
import { openKnowledgeDatabase } from "../../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../../src/electron/knowledgeRepository"
import { WorkspaceStore } from "../../../src/electron/workspaceStore"
import type { KnowledgeNodeId } from "../../../src/shared/knowledgeSchemas"

const roots: string[] = []
const execFileAsync = promisify(execFile)
const cliSummarySchema = z.object({
  mode: z.literal("dry-run"),
  noteCount: z.number().int(),
  paperCount: z.number().int(),
  boardCreateCount: z.number().int(),
  placementCreateCount: z.number().int(),
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}

async function legacyFixture(): Promise<{
  readonly legacyRoot: string
  readonly userDataRoot: string
  readonly collectionId: string
  readonly noteId: KnowledgeNodeId
}> {
  const root = await mkdtemp(join(tmpdir(), "scourgify-prepare-library-"))
  roots.push(root)
  const legacyRoot = join(root, "legacy")
  const userDataRoot = join(root, "user-data")
  const db = openKnowledgeDatabase(join(legacyRoot, "knowledge.sqlite"))
  const repository = new KnowledgeRepository(db)
  const note = repository.createNode({ kind: "note", title: "Private fixture", body: "exact\n" })
  repository.createNode({ kind: "paper", title: "Paper one" })
  repository.createNode({ kind: "paper", title: "Paper two" })
  db.close()
  return { legacyRoot, userDataRoot, collectionId: randomUUID(), noteId: note.id }
}

describe("local library preparation", () => {
  it("runs the explicit CLI arguments as a dry-run by default", async () => {
    const fixture = await legacyFixture()

    const result = await execFileAsync(process.execPath, [
      "--import",
      "tsx",
      "scripts/prepare-local-library.ts",
      "--legacy-root",
      fixture.legacyRoot,
      "--user-data-root",
      fixture.userDataRoot,
      "--collection-id",
      fixture.collectionId,
    ])

    expect(result.stderr).toBe("")
    expect(cliSummarySchema.parse(JSON.parse(result.stdout))).toEqual({
      mode: "dry-run",
      noteCount: 1,
      paperCount: 2,
      boardCreateCount: 1,
      placementCreateCount: 2,
    })
    expect(await readActiveCollection(fixture.userDataRoot)).toBeNull()
  })

  it("reports counts without creating or activating a collection in dry-run mode", async () => {
    const fixture = await legacyFixture()

    const result = await prepareLocalLibrary({ ...fixture, apply: false })

    expect(result).toEqual({
      mode: "dry-run",
      noteCount: 1,
      documentVersionCount: 0,
      paperCount: 2,
      boardCreateCount: 1,
      placementCreateCount: 2,
      missingPdfCount: 0,
    })
    expect(await readActiveCollection(fixture.userDataRoot)).toBeNull()
    expect(await exists(join(fixture.userDataRoot, "collections"))).toBe(false)
  })

  it("migrates copy-only and idempotently places only existing papers", async () => {
    const fixture = await legacyFixture()

    const first = await prepareLocalLibrary({ ...fixture, apply: true })
    const second = await prepareLocalLibrary({ ...fixture, apply: true })

    expect(first).toMatchObject({
      mode: "applied",
      paperCount: 2,
      boardCreateCount: 1,
      placementCreateCount: 2,
    })
    expect(second).toMatchObject({ boardCreateCount: 0, placementCreateCount: 0 })
    const active = await readActiveCollection(fixture.userDataRoot)
    if (!active) throw new Error("Collection was not activated")
    const store = await WorkspaceStore.openCollection(
      collectionRootForId(fixture.userDataRoot, active.collectionId),
      collectionIndexFile(fixture.userDataRoot, active.collectionId),
    )
    try {
      await store.initialize()
      const boards = store.repository
        .listBoards()
        .filter((board) => board.title === "읽고 있는 논문")
      expect(boards).toHaveLength(1)
      const board = boards[0]
      if (!board) throw new Error("Reading board missing")
      const placements = store.repository.findPlacementsForBoard(board.id)
      expect(placements).toHaveLength(2)
      expect(
        placements.map((placement) => store.repository.getNode(placement.nodeId)?.kind),
      ).toEqual(["paper", "paper"])
      expect(store.repository.findNodes({ kind: "project" })).toEqual([])
      expect(store.repository.findRelations()).toEqual([])
      expect(store.collectionService?.getNode(fixture.noteId)?.body).toBe("exact\n")
    } finally {
      await store.close()
    }
    const source = new DatabaseSync(join(fixture.legacyRoot, "knowledge.sqlite"), {
      readOnly: true,
    })
    expect(
      source.prepare("SELECT body FROM knowledge_nodes WHERE id = ?").get(fixture.noteId),
    ).toEqual({
      body: "exact\n",
    })
    source.close()
  })
})
