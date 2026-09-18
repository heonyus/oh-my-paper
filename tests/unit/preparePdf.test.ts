import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { preparePdf } from "../../src/electron/preparePdf"

async function createPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  document.setTitle("Local Paper")
  document.setAuthor("Leaf Research")
  document.setSubject("doi:10.1234/scourgify.2026")
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
    expect(prepared.doi).toBe("10.1234/scourgify.2026")
    expect(prepared.quality.needsOcr).toBe(false)
    expect(prepared.anchors.length).toBeGreaterThan(0)
    expect(prepared.pages[0]?.text).toContain("searchable text")
    expect(prepared.overview).toContain("Page 1: Local preparation extracts searchable text.")
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
})
