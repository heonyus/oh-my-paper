import { readFile } from "node:fs/promises"
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api"
import { describe, expect, it } from "vitest"
import { preparePdf } from "../../src/electron/preparePdf"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import { sourceDocumentAstSchema } from "../../src/shared/documentAst"

const sourceHash = "a".repeat(64)

function textItem(
  str: string,
  x: number,
  baseline: number,
  width: number,
  hasEOL: boolean,
): TextItem {
  return {
    str,
    dir: "ltr",
    transform: [10, 0, 0, 10, x, baseline],
    width,
    height: 10,
    fontName: "Helvetica",
    hasEOL,
  }
}

describe("source document AST", () => {
  it("extracts deterministic page-space provenance and normalized offsets", () => {
    // Given
    const items: readonly (TextItem | TextMarkedContent)[] = [
      textItem("Alpha", 40, 740, 25, false),
      { type: "beginMarkedContent", id: "ignored" },
      textItem("Beta", 80, 740, 20, true),
    ]
    const pages = [
      { page: 1, width: 600, height: 800, items },
      { page: 2, width: 600, height: 800, items: [textItem("Gamma", 40, 740, 30, false)] },
    ]

    // When
    const ast = buildSourceDocumentAst(sourceHash, pages)

    // Then
    expect(sourceDocumentAstSchema.safeParse(ast).success).toBe(true)
    expect(ast.pages).toEqual([
      { id: "page:1", page: 1, width: 600, height: 800 },
      { id: "page:2", page: 2, width: 600, height: 800 },
    ])
    expect(ast.items).toEqual([
      {
        id: "item:1.0",
        pageId: "page:1",
        text: "Alpha",
        normalizedStart: 0,
        normalizedEnd: 5,
        bounds: { x: 40, y: 50, width: 25, height: 10 },
      },
      {
        id: "item:1.2",
        pageId: "page:1",
        text: "Beta",
        normalizedStart: 6,
        normalizedEnd: 10,
        bounds: { x: 80, y: 50, width: 20, height: 10 },
      },
      {
        id: "item:2.0",
        pageId: "page:2",
        text: "Gamma",
        normalizedStart: 0,
        normalizedEnd: 5,
        bounds: { x: 40, y: 50, width: 30, height: 10 },
      },
    ])
    expect(buildSourceDocumentAst(sourceHash, pages)).toEqual(ast)
  })

  it("emits the source AST from the existing PDF.js preparation pass", async () => {
    // Given
    const bytes = await createPdf()

    // When
    const prepared = await preparePdf(bytes, "paper.pdf")

    // Then
    expect(prepared.sourceAst.sourceHash).toBe(prepared.hash)
    expect(prepared.sourceAst.pages).toHaveLength(1)
    expect(prepared.sourceAst.items.map((item) => item.text)).toContain("Source AST output")
  })

  it("keeps malformed and encrypted PDFs as typed preparation failures", async () => {
    const malformed = await readFile("tests/fixtures/document-ast/malformed-document.pdf")
    const encrypted = await readFile("tests/fixtures/document-ast/encrypted-document.pdf")

    await expect(preparePdf(malformed, "malformed-document.pdf")).rejects.toMatchObject({
      name: "PdfPreparationError",
      kind: "invalid_pdf",
    })
    await expect(preparePdf(encrypted, "encrypted-document.pdf")).rejects.toMatchObject({
      name: "PdfPreparationError",
      kind: "password_required",
    })
  })
})

async function createPdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib")
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  document.addPage([600, 800]).drawText("Source AST output", {
    x: 40,
    y: 740,
    size: 10,
    font,
  })
  return document.save()
}
