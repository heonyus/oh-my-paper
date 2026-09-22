// @vitest-environment node
import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import {
  migrateLegacyCollection,
  previewCollectionMigration,
  readActiveCollection,
} from "../../../src/electron/collectionMigration"
import { collectionIndexFile } from "../../../src/electron/collectionPaths"
import { CollectionService } from "../../../src/electron/collectionService"
import { openKnowledgeDatabase } from "../../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../../src/electron/knowledgeRepository"
import {
  documentVersionIdSchema,
  knowledgeNodeIdSchema,
} from "../../../src/shared/knowledgeSchemas"
import { documentIdSchema, sha256Schema } from "../../../src/shared/schemas"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function legacyFixture(): Promise<{
  readonly legacyRoot: string
  readonly userDataRoot: string
  readonly noteId: string
  readonly versionId: string
  readonly pdf: Uint8Array
}> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-migration-"))
  roots.push(root)
  const legacyRoot = join(root, "legacy")
  const userDataRoot = join(root, "user-data")
  const db = openKnowledgeDatabase(join(legacyRoot, "knowledge.sqlite"))
  const repository = new KnowledgeRepository(db)
  const note = repository.createNode({
    kind: "note",
    title: "Legacy note",
    body: "exact  legacy\r\n",
  })
  const paper = repository.createNode({ kind: "paper", title: "Paper", body: "overview" })
  const pdf = Buffer.from("synthetic-pdf-copy")
  const hash = sha256Schema.parse(createHash("sha256").update(pdf).digest("hex"))
  const versionId = documentVersionIdSchema.parse(randomUUID())
  repository.createDocumentVersion({
    id: versionId,
    originalDocumentId: documentIdSchema.parse(randomUUID().replaceAll("-", "").slice(0, 16)),
    paperNodeId: paper.id,
    hash,
    metadata: { missingSource: false },
    createdAt: new Date().toISOString(),
  })
  repository.createRelation({
    sourceId: paper.id,
    targetId: note.id,
    predicate: "discusses",
    provenance: { source: "user", model: null, extractorVersion: null },
    sourceEndpoint: { kind: "node", nodeId: paper.id },
    targetEndpoint: { kind: "node", nodeId: note.id },
    reviewState: "accepted",
  })
  db.prepare(
    "INSERT INTO legacy_migration_markers (id, migrated_at, source_file, node_count) VALUES (?, ?, ?, ?)",
  ).run("synthetic-marker", new Date().toISOString(), "/synthetic/profile/workspace.json", 2)
  db.close()
  await writeFile(join(legacyRoot, "workspace.json"), '{"legacy":true}\n')
  await mkdir(join(legacyRoot, "documents"), { recursive: true })
  await writeFile(join(legacyRoot, "documents", `${hash}.pdf`), pdf)
  return { legacyRoot, userDataRoot, noteId: note.id, versionId, pdf }
}

describe("collection migration", () => {
  it("activates only after preserving canonical notes, metadata backup, relations and PDF copies", async () => {
    const fixture = await legacyFixture()
    const collectionId = randomUUID()
    const preview = await previewCollectionMigration(
      fixture.legacyRoot,
      fixture.userDataRoot,
      collectionId,
    )
    expect(preview).toMatchObject({ noteCount: 1, documentVersionCount: 1 })

    const result = await migrateLegacyCollection(
      fixture.legacyRoot,
      fixture.userDataRoot,
      collectionId,
    )
    const active = await readActiveCollection(fixture.userDataRoot)
    expect(active?.collectionId).toBe(collectionId)
    const repeated = await migrateLegacyCollection(
      fixture.legacyRoot,
      fixture.userDataRoot,
      collectionId,
    )
    expect(repeated.destinationRoot).toBe(result.destinationRoot)
    expect(
      await readFile(join(result.destinationRoot, "papers", `${fixture.versionId}.pdf`)),
    ).toEqual(Buffer.from(fixture.pdf))
    const service = await CollectionService.open(
      result.destinationRoot,
      collectionIndexFile(fixture.userDataRoot, collectionId),
    )
    expect(service.getNode(knowledgeNodeIdSchema.parse(fixture.noteId))?.body).toBe(
      "exact  legacy\r\n",
    )
    expect(service.repository.findRelations()).toHaveLength(1)
    expect(
      service.repository.db
        .prepare("SELECT body FROM knowledge_nodes WHERE id = ?")
        .get(fixture.noteId),
    ).toEqual({ body: "" })
    expect(
      service.repository.db.prepare("SELECT source_file FROM legacy_migration_markers").get(),
    ).toEqual({ source_file: "legacy-workspace.json" })
    await service.close()
    const backup = new DatabaseSync(
      join(result.destinationRoot, ".ohmypaper", "migration-backup", "knowledge.sqlite"),
      { readOnly: true },
    )
    expect(
      backup.prepare("SELECT body FROM knowledge_nodes WHERE id = ?").get(fixture.noteId),
    ).toEqual({
      body: "exact  legacy\r\n",
    })
    backup.close()
  })

  it("does not activate a destination when a managed PDF hash is wrong", async () => {
    const fixture = await legacyFixture()
    const files = await readdir(join(fixture.legacyRoot, "documents"))
    const pdfName = files.find((name) => name.endsWith(".pdf"))
    if (!pdfName) throw new Error("fixture PDF missing")
    await writeFile(join(fixture.legacyRoot, "documents", pdfName), "changed")

    await expect(
      migrateLegacyCollection(fixture.legacyRoot, fixture.userDataRoot, randomUUID()),
    ).rejects.toThrow("hash mismatch")
    expect(await readActiveCollection(fixture.userDataRoot)).toBeNull()
    expect(await readFile(join(fixture.legacyRoot, "documents", pdfName), "utf8")).toBe("changed")
  })

  it("creates an empty non-destructive collection for a fresh disposable profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-fresh-profile-"))
    roots.push(root)
    const userDataRoot = join(root, "user-data")
    const result = await migrateLegacyCollection(
      join(userDataRoot, "ohmypaper"),
      userDataRoot,
      randomUUID(),
    )
    const service = await CollectionService.open(
      result.destinationRoot,
      collectionIndexFile(userDataRoot, result.collectionId),
    )

    expect(service.findNodes()).toEqual([])
    expect((await service.status()).state).toBe("ready")
    await service.close()
  })
})
