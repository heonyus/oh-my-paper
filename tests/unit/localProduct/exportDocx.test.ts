// @vitest-environment node
import JSZip from "jszip"
import { describe, expect, it, vi } from "vitest"
import { exportDocx } from "../../../src/electron/exportDocx"
import { createExportSnapshot } from "../../../src/electron/exportSnapshot"

describe("DOCX export", () => {
  it("creates editable paragraphs, a repeating-header table, native simple math, and disclosed fallback math", async () => {
    // Given
    const snapshot = createExportSnapshot({
      format: "scourgify-export-snapshot-v1",
      title: "Editable report",
      revision: "c".repeat(64),
      markdown: [
        "# Findings",
        "Editable **prose**.",
        "",
        "| Cohort | AUROC |",
        "| --- | ---: |",
        "| test | 0.81 |",
        "",
        "$x + y = 2$",
        "",
        "$$\\frac{a}{b}$$",
      ].join("\n"),
      records: [],
      assets: [],
      bibliography: [],
      sources: [],
    })
    const renderMath = vi.fn(async (latex: string) => ({
      bytes: Uint8Array.from([137, 80, 78, 71]),
      mediaType: "image/png" as const,
      width: 180,
      height: 48,
      altText: `LaTeX: ${latex}`,
    }))

    // When
    const file = await exportDocx(snapshot, { renderMath })
    const archive = await JSZip.loadAsync(file.bytes)
    const documentXml = await archive.file("word/document.xml")?.async("string")
    const documentText = documentXml?.replace(/<[^>]+>/g, "")

    // Then
    expect(documentText).toContain("Editable prose.")
    expect(documentXml).toContain("<w:tbl>")
    expect(documentXml).toContain("<w:tblHeader")
    expect(documentXml).toContain("<m:oMath>")
    expect(documentXml).toContain("LaTeX: \\frac{a}{b}")
    expect(documentText).toContain(
      "Equation rendered as an image; LaTeX is in its alternative text.",
    )
    expect(renderMath).toHaveBeenCalledWith("\\frac{a}{b}")
  })
})
