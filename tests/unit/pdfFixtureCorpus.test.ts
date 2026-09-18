import { promises as fs } from "node:fs"
import * as path from "node:path"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import {
  buildDocumentFixtureCorpus,
  DOCUMENT_FIXTURE_CORPUS_DIRECTORY,
  DOCUMENT_FIXTURE_MANIFEST_PATH,
  documentFixtureManifestSchema,
  readDocumentFixtureManifest,
  requiredFixtureClasses,
} from "../../scripts/document-fixtures"

describe("synthetic document fixture corpus", () => {
  it("loads a Zod-validated manifest covering every required fixture class", async () => {
    const manifest = await readDocumentFixtureManifest(DOCUMENT_FIXTURE_MANIFEST_PATH)
    const fixtureClasses = new Set(manifest.fixtures.flatMap((fixture) => fixture.classes))

    expect(documentFixtureManifestSchema.safeParse(manifest).success).toBe(true)
    expect(requiredFixtureClasses.every((fixtureClass) => fixtureClasses.has(fixtureClass))).toBe(
      true,
    )
    expect(
      manifest.fixtures.every((fixture) =>
        fixture.parseExpectation === "valid"
          ? fixture.pages.length > 0
          : fixture.pages.length === 0,
      ),
    ).toBe(true)
  })

  it("rejects a manifest whose source range exceeds its declared page", async () => {
    const manifest = await readDocumentFixtureManifest(DOCUMENT_FIXTURE_MANIFEST_PATH)
    const firstFixture = manifest.fixtures[0]
    const firstPage = firstFixture?.pages[0]
    const firstRange = firstPage?.sourceRanges[0]
    expect(firstFixture).toBeDefined()
    expect(firstPage).toBeDefined()
    expect(firstRange).toBeDefined()
    if (firstFixture === undefined || firstPage === undefined || firstRange === undefined) return

    const corrupted = {
      ...manifest,
      fixtures: manifest.fixtures.map((fixture) =>
        fixture.id === firstFixture.id
          ? {
              ...fixture,
              pages: fixture.pages.map((page) =>
                page.number === firstPage.number
                  ? {
                      ...page,
                      sourceRanges: page.sourceRanges.map((range) =>
                        range.id === firstRange.id ? { ...range, end: range.start - 1 } : range,
                      ),
                    }
                  : page,
              ),
            }
          : fixture,
      ),
    }

    expect(documentFixtureManifestSchema.safeParse(corrupted).success).toBe(false)
  })

  it("recreates byte-identical valid fixtures and records their SHA-256 values", async () => {
    const firstDirectory = path.join(process.cwd(), ".omo/test-artifacts/document-fixtures-a")
    const secondDirectory = path.join(process.cwd(), ".omo/test-artifacts/document-fixtures-b")
    const first = await buildDocumentFixtureCorpus(firstDirectory)
    const second = await buildDocumentFixtureCorpus(secondDirectory)

    expect(first.manifest).toEqual(second.manifest)
    for (const fixture of first.manifest.fixtures) {
      const firstBytes = await fs.readFile(path.join(firstDirectory, fixture.fileName))
      const secondBytes = await fs.readFile(path.join(secondDirectory, fixture.fileName))
      expect(firstBytes.equals(secondBytes)).toBe(true)
      expect(firstBytes.byteLength).toBe(fixture.byteLength)
      expect(first.hashes[fixture.id]).toBe(fixture.sha256)
    }
  })

  it("parses ordinary fixtures and preserves explicit malformed/encrypted cases", async () => {
    const manifest = await readDocumentFixtureManifest(DOCUMENT_FIXTURE_MANIFEST_PATH)
    for (const fixture of manifest.fixtures) {
      const bytes = await fs.readFile(
        path.join(DOCUMENT_FIXTURE_CORPUS_DIRECTORY, fixture.fileName),
      )
      const pdfBytes = new Uint8Array(bytes)
      switch (fixture.parseExpectation) {
        case "valid": {
          const document = await PDFDocument.load(pdfBytes)
          expect(document.getPageCount()).toBe(fixture.pageCount)
          break
        }
        case "malformed":
          expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-")
          expect(fixture.pageCount).toBe(0)
          break
        case "encrypted":
          expect(new TextDecoder().decode(pdfBytes)).toContain("/Encrypt")
          expect(fixture.pageCount).toBe(0)
          break
        default:
          fixture.parseExpectation satisfies never
      }
    }
  })
})
