import { describe, expect, it } from "vitest"
import { detectPdfFeatures, type PdfTextSpan } from "../../src/renderer/lib/pdfFeatureDetection"
import { mergePdfTextLines } from "../../src/renderer/lib/pdfTextLines"

type SpanInput = Pick<PdfTextSpan, "id" | "text" | "x" | "y" | "width"> & {
  readonly height?: number
}

function span(input: SpanInput): PdfTextSpan {
  return {
    ...input,
    height: input.height ?? 10,
    fontSize: input.height ?? 10,
    fontWeight: 400,
  }
}

function springerEquationSpans(): readonly PdfTextSpan[] {
  return [
    span({ id: "retire-symbol", text: "D", x: 110, y: 750, width: 6 }),
    span({ id: "retire-subscript", text: "t", x: 118, y: 754, width: 3, height: 7 }),
    span({ id: "retire-equals", text: "¼", x: 136, y: 750, width: 7 }),
    span({ id: "retire-name", text: "Retire", x: 204, y: 750, width: 22 }),
    span({ id: "retire-open", text: "ð", x: 226, y: 750, width: 5 }),
    span({ id: "retire-arg", text: "U", x: 230, y: 750, width: 8 }),
    span({ id: "retire-arg-subscript", text: "t", x: 237, y: 754, width: 3, height: 7 }),
    span({ id: "retire-close", text: "Þ", x: 240, y: 750, width: 5 }),
    span({ id: "retire-end", text: ";", x: 244, y: 750, width: 3 }),

    span({ id: "update-symbol", text: "M", x: 105, y: 796, width: 8 }),
    span({ id: "update-accent", text: "c", x: 105, y: 793, width: 4 }),
    span({ id: "update-subscript", text: "t", x: 115, y: 800, width: 3, height: 7 }),
    span({ id: "update-plus", text: "þ", x: 118, y: 800, width: 4, height: 7 }),
    span({ id: "update-one", text: "1", x: 123, y: 800, width: 4, height: 7 }),
    span({ id: "update-equals", text: "¼", x: 136, y: 796, width: 7 }),
    span({ id: "update-name", text: "Update", x: 154, y: 796, width: 28 }),
    span({ id: "update-old", text: "M", x: 213, y: 796, width: 8 }),
    span({ id: "update-old-subscript", text: "t", x: 224, y: 800, width: 3, height: 7 }),
    span({ id: "update-minus", text: "n", x: 229, y: 796, width: 5 }),
    span({ id: "update-retired", text: "D", x: 236, y: 796, width: 6 }),
    span({ id: "update-retired-subscript", text: "t", x: 244, y: 800, width: 3, height: 7 }),
    span({ id: "update-separator", text: ";", x: 270, y: 796, width: 3 }),
    span({ id: "update-actions", text: "U", x: 275, y: 796, width: 8 }),
    span({ id: "update-actions-subscript", text: "t", x: 282, y: 800, width: 3, height: 7 }),

    span({ id: "write-symbol", text: "M", x: 105, y: 846, width: 8 }),
    span({ id: "write-subscript", text: "t", x: 115, y: 850, width: 3, height: 7 }),
    span({ id: "write-plus", text: "þ", x: 118, y: 850, width: 4, height: 7 }),
    span({ id: "write-one", text: "1", x: 123, y: 850, width: 4, height: 7 }),
    span({ id: "write-equals", text: "¼", x: 136, y: 846, width: 7 }),
    span({ id: "write-memory", text: "M", x: 165, y: 846, width: 8 }),
    span({ id: "write-union", text: "∪", x: 188, y: 846, width: 6 }),
    span({ id: "write-new", text: "E", x: 231, y: 846, width: 6 }),
    span({ id: "write-new-label", text: "new", x: 236, y: 844, width: 11, height: 7 }),
    span({ id: "write-end", text: ":", x: 283, y: 846, width: 3 }),

    span({ id: "number-open", text: "ð", x: 341, y: 814, width: 5 }),
    span({ id: "number-value", text: "4", x: 345, y: 814, width: 7 }),
    span({ id: "number-close", text: "Þ", x: 350, y: 814, width: 6 }),
    span({
      id: "right-column-prose",
      text: "answers prepared by human experts and independently cross-validated by",
      x: 367,
      y: 814,
      width: 306,
    }),
  ]
}

describe("Springer display equation detection", () => {
  it("separates an equation number at the gutter from adjacent-column prose", () => {
    const lines = mergePdfTextLines(springerEquationSpans(), 714)

    expect(lines.some((line) => line.text.includes("ð 4 Þ answers prepared"))).toBe(false)
    expect(lines.some((line) => line.text === "ð 4 Þ")).toBe(true)
  })

  it("recognizes a numbered multiline equation with Springer math-font text mappings", () => {
    const spans = mergePdfTextLines(springerEquationSpans(), 714)
    const equation = detectPdfFeatures({
      pageNumber: 9,
      pageWidth: 714,
      pageHeight: 949,
      spans,
    }).find((feature) => feature.kind === "equation")

    expect(equation?.label).toBe("Equation (4)")
    expect(equation?.context).toContain("Retire")
    expect(equation?.context).toContain("Update")
    expect(equation?.context).not.toContain("answers prepared")
    expect(equation?.rect.y).toBeLessThanOrEqual(750)
    expect((equation?.rect.y ?? 0) + (equation?.rect.height ?? 0)).toBeGreaterThanOrEqual(856)
  })
})
