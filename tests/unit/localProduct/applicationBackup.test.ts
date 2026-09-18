// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { createApplicationBackup } from "../../../src/electron/applicationBackup"
import {
  createCanonicalNoteBytes,
  initializeCollection,
  initialNoteRelativePath,
} from "../../../src/electron/collectionFiles"
import { WorkspaceStore } from "../../../src/electron/workspaceStore"
import { knowledgeNodeIdSchema } from "../../../src/shared/knowledgeIds"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("application backup adapter", () => {
  it("backs up canonical note bytes and metadata from the live collection", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-application-backup-"))
    const destinationParent = await mkdtemp(join(tmpdir(), "scourgify-backup-destination-"))
    roots.push(root, destinationParent)
    await initializeCollection(root, randomUUID())
    const store = await WorkspaceStore.openCollection(root, join(root, "machine-index.sqlite"))
    try {
      await store.initialize()
      const collection = store.collection
      if (!collection) throw new Error("Collection service was not opened")
      const nodeId = knowledgeNodeIdSchema.parse(randomUUID())
      const noteBytes = Buffer.from(createCanonicalNoteBytes(nodeId, "canonical backup body"))
      let acknowledgeCause: unknown = null
      const saved = await collection.files.saveNote({
        relativePath: initialNoteRelativePath(nodeId),
        bytes: noteBytes,
        expectedRevision: null,
        reason: "explicit_save",
        acknowledge: async (note) => {
          try {
            collection.repository.withCanonicalNoteWrite(() =>
              collection.repository.createNode({
                id: nodeId,
                kind: "note",
                title: "Canonical backup note",
                body: "",
              }),
            )
            collection.index.upsert(note, { title: "Canonical backup note", aliases: [] })
          } catch (error) {
            acknowledgeCause = error
            throw error
          }
        },
      })
      expect(acknowledgeCause).toBeNull()
      expect(saved.kind).toBe("saved")

      const result = await createApplicationBackup(store, collection).create(destinationParent)
      const [backupDirectory] = await readdir(destinationParent)
      if (!backupDirectory) throw new Error("Backup directory was not created")
      const metadataPath = join(
        destinationParent,
        backupDirectory,
        "payload",
        ".scourgify",
        "metadata.sqlite",
      )
      const metadata = new DatabaseSync(metadataPath, { readOnly: true })
      try {
        const row = metadata.prepare("SELECT COUNT(*) AS count FROM knowledge_nodes").get()
        expect(row).toMatchObject({ count: 1 })
      } finally {
        metadata.close()
      }
      expect(result.entryCount).toBeGreaterThan(1)
      expect(
        await readFile(
          join(destinationParent, backupDirectory, "payload", initialNoteRelativePath(nodeId)),
        ),
      ).toEqual(Buffer.from(noteBytes))
      expect(
        (
          await readFile(join(destinationParent, backupDirectory, "payload", "collection.json"))
        ).toString("utf8"),
      ).toContain(result.sourceCollectionId)
    } finally {
      await store.close()
    }
  })
})
