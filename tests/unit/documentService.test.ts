// @vitest-environment node

import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PDFDocument } from "pdf-lib"
import { afterEach, describe, expect, it } from "vitest"
import { importDocument } from "../../src/electron/documentService"
import { WorkspaceStore } from "../../src/electron/workspaceStore"

const temporaryDirectories: string[] = []
const stores: WorkspaceStore[] = []

/** A store closed after the test, before its folder is removed. */
function openStore(root: string): WorkspaceStore {
  const store = new WorkspaceStore(root)
  stores.push(store)
  return store
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()))
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe("document import", () => {
  it("accepts a PDF whose author metadata is an empty string", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ohmypaper-document-import-"))
    temporaryDirectories.push(directory)
    const source = join(directory, "empty-author.pdf")
    const pdf = await PDFDocument.create()
    pdf.addPage()
    pdf.setTitle("")
    pdf.setAuthor("")
    await writeFile(source, await pdf.save())

    const imported = await importDocument(
      source,
      openStore(join(directory, "store")),
      "original-paper-name.pdf",
    )

    expect(imported?.document.authors).toEqual([])
    expect(imported?.document.name).toBe("original-paper-name.pdf")
    expect(imported?.document.title).toBe("original-paper-name")
  })

  it("persists the inspected bytes and repairs a missing duplicate original", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ohmypaper-document-import-"))
    temporaryDirectories.push(directory)
    const source = join(directory, "paper.pdf")
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = await pdf.save()
    await writeFile(source, bytes)
    const store = openStore(join(directory, "store"))

    const first = await importDocument(source, store)
    if (!first) throw new Error("Expected imported document")
    const storedPath = join(store.documentsDirectory, `${first.document.hash}.pdf`)
    expect(await readFile(storedPath)).toEqual(Buffer.from(bytes))
    await rm(storedPath)

    const duplicate = await importDocument(source, store)
    if (!duplicate) throw new Error("Expected duplicate result")
    expect(duplicate.duplicate).toBe(true)
    expect(await readFile(storedPath)).toEqual(Buffer.from(bytes))
  })

  it("rejects a mismatched content-addressed original before metadata registration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ohmypaper-document-import-"))
    temporaryDirectories.push(directory)
    const source = join(directory, "paper.pdf")
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = await pdf.save()
    await writeFile(source, bytes)
    const hash = createHash("sha256").update(bytes).digest("hex")
    const store = openStore(join(directory, "store"))
    await mkdir(store.documentsDirectory, { recursive: true })
    await writeFile(join(store.documentsDirectory, `${hash}.pdf`), Buffer.from("not this PDF"))

    await expect(importDocument(source, store)).rejects.toThrow()
    expect((await store.read()).documents).toHaveLength(0)
  })
})
