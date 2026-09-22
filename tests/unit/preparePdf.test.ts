import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { preparePdf } from "../../src/electron/preparePdf"

async function createPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  document.setTitle("Local Paper")
  document.setAuthor("Leaf Research")
  document.setSubject("doi:10.1234/ohmypaper.2026")
  document.addPage([612, 792]).drawText("Local preparation extracts searchable text.", {
    x: 72,
    y: 700,
    size: 14,
    font,
  })
  document.addPage([612, 792]).drawText("Second page keeps vertical order.", {
    x: 72,
    y: 700,
    size: 14,
    font,
  })
  return document.save()
}

async function createMetadataBoundaryPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  document.setTitle("")
  document.setCreationDate(new Date("2024-01-01T00:00:00.000Z"))
  document
    .addPage([612, 792])
    .drawText("A Confident First Page Title", { x: 72, y: 700, size: 20, font })
  document
    .getPages()[0]
    ?.drawText("The body mentions 2017 without calling it a publication date.", {
      x: 72,
      y: 650,
      size: 10,
      font,
    })
  return document.save()
}

describe("local PDF preparation", () => {
  it("extracts metadata, pages, text quality and anchors without network access", async () => {
    // Given
    const bytes = await createPdf()

    // When
    const prepared = await preparePdf(bytes, "paper.pdf")

    // Then
    expect(prepared.pageCount).toBe(2)
    expect(prepared.title).toBe("Local Paper")
    expect(prepared.authors).toEqual(["Leaf Research"])
    expect(prepared.doi).toBe("10.1234/ohmypaper.2026")
    expect(prepared.year).toBeNull()
    expect(prepared.quality.needsOcr).toBe(false)
    expect(prepared.anchors.length).toBeGreaterThan(0)
    expect(prepared.pages[0]?.text).toContain("searchable text")
    expect(prepared.overview).toContain("Page 1: Local preparation extracts searchable text.")
  })

  it("does not use PDF creation date as publication year and keeps a confident first-page title", async () => {
    const prepared = await preparePdf(await createMetadataBoundaryPdf(), "1706050100-upload.pdf")

    expect(prepared.title).toBe("A Confident First Page Title")
    expect(prepared.year).toBeNull()
  })

  it("rejects non-PDF input", async () => {
    // Given
    const bytes = new TextEncoder().encode("not a pdf")

    // When / Then
    await expect(preparePdf(bytes, "bad.pdf")).rejects.toMatchObject({
      name: "PdfPreparationError",
      kind: "invalid_pdf",
    })
  })

  it("joins adjacent title lines with the same font size", async () => {
    const document = await PDFDocument.create()
    document.setTitle("")
    const font = await document.embedFont(StandardFonts.Helvetica)
    const page = document.addPage([612, 792])
    page.drawText("Pre-training Bidirectional Transformers", { x: 72, y: 720, size: 18, font })
    page.drawText("for Language Understanding arXiv:1810.04805v2 [cs.CL]", {
      x: 72,
      y: 699,
      size: 18,
      font,
    })
    page.drawText("Jacob Devlin Ming-Wei Chang Kenton Lee Kristina Toutanova", {
      x: 72,
      y: 655,
      size: 12,
      font,
    })
    page.drawText("Research University", { x: 72, y: 635, size: 10, font })
    const prepared = await preparePdf(await document.save(), "paper.pdf")

    expect(prepared.title).toBe(
      "Pre-training Bidirectional Transformers for Language Understanding",
    )
    expect(prepared.authors).toEqual([
      "Jacob Devlin",
      "Ming-Wei Chang",
      "Kenton Lee",
      "Kristina Toutanova",
    ])
  })
})
