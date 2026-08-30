// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PDFDocument } from "pdf-lib"
import { afterEach, describe, expect, it } from "vitest"
import { importDocument } from "../../src/electron/documentService"
import { WorkspaceStore } from "../../src/electron/workspaceStore"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe("document import", () => {
  it("accepts a PDF whose author metadata is an empty string", async () => {
    const directory = await mkdtemp(join(tmpdir(), "scourgify-document-import-"))
    temporaryDirectories.push(directory)
    const source = join(directory, "empty-author.pdf")
    const pdf = await PDFDocument.create()
    pdf.addPage()
    pdf.setTitle("")
    pdf.setAuthor("")
    await writeFile(source, await pdf.save())

    const imported = await importDocument(source, new WorkspaceStore(join(directory, "store")))

    expect(imported?.document.authors).toEqual([])
    expect(imported?.document.title).toBe("empty-author")
  })
})
