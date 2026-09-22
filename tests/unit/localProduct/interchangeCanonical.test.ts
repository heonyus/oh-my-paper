// @vitest-environment node
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  initializeCollection,
  initialNoteRelativePath,
} from "../../../src/electron/collectionFiles"
import { readCanonicalNoteBody } from "../../../src/electron/collectionFrontmatter"
import { CollectionService } from "../../../src/electron/collectionService"
import { parseMarkdownNode, serializeMarkdownNode } from "../../../src/electron/interchangeMarkdown"
import { InterchangeService } from "../../../src/electron/interchangeService"
import { knowledgeNodeIdSchema } from "../../../src/shared/knowledgeSchemas"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function openCollection(): Promise<{
  readonly root: string
  readonly collection: CollectionService
}> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-interchange-"))
  roots.push(root)
  await initializeCollection(root, randomUUID())
  return {
    root,
    collection: await CollectionService.open(root, join(root, "machine-index.sqlite")),
  }
}

function importedNote(id: string, title: string, body: string) {
  return parseMarkdownNode(
    serializeMarkdownNode(
      {
        id: knowledgeNodeIdSchema.parse(id),
        kind: "note",
        title,
        body,
        aliases: [],
        metadata: {},
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
      },
      [],
      [],
    ),
  )
}

describe("canonical interchange imports", () => {
  it("writes an imported Markdown note to the canonical collection", async () => {
    const fixture = await openCollection()
    const service = new InterchangeService(fixture.collection.repository, {
      collection: fixture.collection,
    })
    const note = importedNote(
      "11111111-aaaa-4111-8111-111111111111",
      "Imported note",
      "canonical  body\r\n",
    )

    const result = await service.commitMarkdownImport([note])

    expect(result.createdNodes.map((node) => node.id)).toEqual([note.frontMatter.id])
    const indexed = fixture.collection.index.get(note.frontMatter.id)
    if (!indexed) throw new Error("Imported note was not indexed")
    expect(readCanonicalNoteBody(await readFile(join(fixture.root, indexed.relativePath)))).toBe(
      note.body,
    )
    expect(
      fixture.collection.repository.db
        .prepare("SELECT body FROM knowledge_nodes WHERE id = ?")
        .get(note.frontMatter.id),
    ).toEqual({ body: "" })
    await fixture.collection.close()
  })

  it("never overwrites an existing canonical note ID", async () => {
    const fixture = await openCollection()
    const service = new InterchangeService(fixture.collection.repository, {
      collection: fixture.collection,
    })
    const original = importedNote(
      "22222222-aaaa-4222-8222-222222222222",
      "Original note",
      "original  bytes\r\n",
    )
    await service.commitMarkdownImport([original])
    const indexed = fixture.collection.index.get(original.frontMatter.id)
    if (!indexed) throw new Error("Imported note was not indexed")
    const notePath = join(fixture.root, indexed.relativePath)
    const before = await readFile(notePath)
    const conflict = importedNote(original.frontMatter.id, "Replacement", "replacement\n")

    await expect(service.commitMarkdownImport([conflict])).rejects.toThrow("Conflict detected")

    expect(await readFile(notePath)).toEqual(before)
    expect(fixture.collection.getNode(original.frontMatter.id)?.body).toBe(original.body)
    await fixture.collection.close()
  })

  it("can retry after a later canonical note fails without losing the completed note", async () => {
    const fixture = await openCollection()
    const service = new InterchangeService(fixture.collection.repository, {
      collection: fixture.collection,
    })
    const first = importedNote("33333333-aaaa-4333-8333-333333333333", "First note", "first\n")
    const second = importedNote("44444444-aaaa-4444-8444-444444444444", "Second note", "second\n")
    const blockedPath = join(fixture.root, initialNoteRelativePath(second.frontMatter.id))
    await mkdir(blockedPath)

    await expect(service.commitMarkdownImport([first, second])).rejects.toThrow()

    expect(fixture.collection.getNode(first.frontMatter.id)?.body).toBe(first.body)
    expect(fixture.collection.getNode(second.frontMatter.id)).toBeNull()
    await rm(blockedPath, { recursive: true })
    const retried = await service.commitMarkdownImport([first, second])
    expect(retried.skippedNodeIds).toEqual([first.frontMatter.id])
    expect(retried.createdNodes.map((node) => node.id)).toEqual([second.frontMatter.id])
    await fixture.collection.close()
  })
})
