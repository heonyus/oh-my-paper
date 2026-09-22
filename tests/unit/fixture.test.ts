import { promises as fs } from "node:fs"
import * as path from "node:path"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import {
  buildFixturePdf,
  DEFAULT_FIXTURE_METADATA,
  DEFAULT_FIXTURE_PATH,
  writeFixturePdf,
} from "../../scripts/create-fixture"

describe("Deterministic PDF Fixture Generator", () => {
  it("generates a valid multi-page PDF document buffer with exact page count", async () => {
    const pdfBytes = await buildFixturePdf()
    expect(pdfBytes).toBeInstanceOf(Uint8Array)
    expect(pdfBytes.byteLength).toBeGreaterThan(1000)

    const doc = await PDFDocument.load(pdfBytes)
    expect(doc.getPageCount()).toBe(3)
  })

  it("embeds accurate and deterministic metadata", async () => {
    const pdfBytes = await buildFixturePdf()
    const doc = await PDFDocument.load(pdfBytes)

    expect(doc.getTitle()).toBe(DEFAULT_FIXTURE_METADATA.title)
    expect(doc.getAuthor()).toBe(DEFAULT_FIXTURE_METADATA.author)
    expect(doc.getSubject()).toBe(DEFAULT_FIXTURE_METADATA.subject)
    expect(doc.getProducer()).toBe(DEFAULT_FIXTURE_METADATA.producer)
    expect(doc.getCreator()).toBe(DEFAULT_FIXTURE_METADATA.creator)
    expect(doc.getKeywords()).toContain("ohmypaper")
    const creationDate = doc.getCreationDate()
    expect(creationDate?.toISOString()).toBe(DEFAULT_FIXTURE_METADATA.creationDate.toISOString())
  })

  it("supports custom metadata and deterministic overrides", async () => {
    const customDate = new Date("2026-01-01T12:00:00.000Z")
    const pdfBytes = await buildFixturePdf({
      title: "Custom oh-my-paper Test",
      author: "Custom Author",
      creationDate: customDate,
    })
    const doc = await PDFDocument.load(pdfBytes)

    expect(doc.getTitle()).toBe("Custom oh-my-paper Test")
    expect(doc.getAuthor()).toBe("Custom Author")
    const creationDate = doc.getCreationDate()
    expect(creationDate?.toISOString()).toBe(customDate.toISOString())
  })

  it("writes the fixture to disk deterministically and creates output directory if needed", async () => {
    const tempDir = path.resolve(process.cwd(), ".omo/test-artifacts/fixture-test")
    const targetFile = path.join(tempDir, "output-fixture.pdf")

    const result = await writeFixturePdf(targetFile)
    expect(result.outputPath).toBe(targetFile)
    expect(result.pageCount).toBe(3)
    expect(result.byteLength).toBeGreaterThan(1000)

    const fileBuffer = await fs.readFile(targetFile)
    expect(fileBuffer.byteLength).toBe(result.byteLength)

    const doc = await PDFDocument.load(new Uint8Array(fileBuffer))
    expect(doc.getPageCount()).toBe(3)
  })

  it("defaults to DEFAULT_FIXTURE_PATH when writing without custom path", async () => {
    const result = await writeFixturePdf()
    expect(result.outputPath).toBe(DEFAULT_FIXTURE_PATH)
    const fileExists = await fs
      .stat(result.outputPath)
      .then(() => true)
      .catch(() => false)
    expect(fileExists).toBe(true)
  })
})
