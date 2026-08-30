import { PDFDocument } from "pdf-lib"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { describe, expect, it } from "vitest"
import { analyzePdfDocument, featureToStructure } from "../../src/renderer/lib/pdfDocumentFeatures"

describe("PDF document feature metadata", () => {
  it("preserves the registered document title when PDF metadata is blank", async () => {
    const source = await PDFDocument.create()
    source.setTitle("")
    source.addPage([612, 792])
    const loadingTask = getDocument({ data: await source.save() })
    const pdf = await loadingTask.promise

    try {
      const result = await analyzePdfDocument(pdf, "Registered paper title")

      expect(result.summary.title).toBe("Registered paper title")
    } finally {
      await loadingTask.destroy()
    }
  })
})

describe("featureToStructure", () => {
  it("uses the suffixed author-year bibliography entry for citation lookup", () => {
    const structure = featureToStructure(
      {
        kind: "citation",
        pageNumber: 2,
        label: "Tang et al., 2024a",
        context: "BioCoder (Tang et al., 2024a) assesses code generation.",
        rect: { x: 300, y: 240, width: 100, height: 20 },
        priority: 1,
        sourceSpanIds: [],
      },
      [],
      {
        "tang-2024a": {
          key: "tang-2024a",
          title: "BioCoder: A benchmark for bioinformatics code generation",
          authors: "Xiangru Tang et al.",
          year: 2024,
          venue: "Bioinformatics",
          rawText: "Xiangru Tang et al. BioCoder. Bioinformatics, 2024a.",
        },
      },
    )

    expect(structure.reference?.key).toBe("tang-2024a")
    expect(structure.reference?.title).toContain("BioCoder")
  })
})
