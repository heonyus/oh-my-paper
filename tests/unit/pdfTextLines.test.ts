import { describe, expect, it } from "vitest"
import { mergePdfTextLines, normalizeExtractedPdfText } from "../../src/renderer/lib/pdfTextLines"

describe("mergePdfTextLines", () => {
  it("repairs PDF text layers that insert spaces inside uppercase words", () => {
    expect(normalizeExtractedPdfText("G ENERALIZATION, A BLATION, AND E RROR A NALYSIS")).toBe(
      "GENERALIZATION, ABLATION, AND ERROR ANALYSIS",
    )
  })

  it("joins split heading spans without merging the opposite column", () => {
    const lines = mergePdfTextLines([
      { id: "n", text: "2.1", x: 70, y: 100, width: 20, height: 14, fontSize: 12, fontWeight: 700 },
      {
        id: "h",
        text: "Methods",
        x: 94,
        y: 100,
        width: 70,
        height: 14,
        fontSize: 12,
        fontWeight: 700,
      },
      {
        id: "r",
        text: "Right column",
        x: 350,
        y: 100,
        width: 100,
        height: 14,
        fontSize: 9,
        fontWeight: 400,
      },
    ])

    expect(lines.map((line) => line.text)).toEqual(["2.1 Methods", "Right column"])
  })

  it("joins split inline citation tokens into one line", () => {
    const lines = mergePdfTextLines([
      {
        id: "a",
        text: "Prior work",
        x: 70,
        y: 140,
        width: 70,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "b",
        text: "[12, 14]",
        x: 144,
        y: 140,
        width: 44,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "c",
        text: "improves retrieval",
        x: 192,
        y: 140,
        width: 110,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
    ])

    expect(lines[0]?.text).toBe("Prior work [12, 14] improves retrieval")
  })

  it("keeps nearby left and right column lines separate across the gutter", () => {
    const spans = [
      { id: "lc", text: "Figure 4: Error statistics", x: 30, y: 100, width: 240 },
      { id: "rh", text: "5.5 Impact of Context Length", x: 282, y: 100, width: 240 },
      { id: "l1", text: "Left column body one", x: 30, y: 125, width: 220 },
      { id: "r1", text: "Right column body one", x: 282, y: 125, width: 230 },
      { id: "l2", text: "Left column body two", x: 30, y: 150, width: 220 },
      { id: "r2", text: "Right column body two", x: 282, y: 150, width: 230 },
    ].map((span) => ({
      ...span,
      height: 12,
      fontSize: 9,
      fontWeight: 400,
    }))

    const lines = mergePdfTextLines(spans, 600)

    expect(lines.map((line) => line.text)).toContain("Figure 4: Error statistics")
    expect(lines.map((line) => line.text)).toContain("5.5 Impact of Context Length")
    expect(lines.map((line) => line.text)).not.toContain(
      "Figure 4: Error statistics 5.5 Impact of Context Length",
    )
  })

  it("keeps full-width small-caps headings intact on chart-heavy pages", () => {
    const pairedChartLabels = Array.from({ length: 4 }, (_, index) => [
      {
        id: `left-${index}`,
        text: `Left chart ${index}`,
        x: 120,
        y: 300 + index * 18,
        width: 90,
      },
      {
        id: `right-${index}`,
        text: `Right chart ${index}`,
        x: 390,
        y: 300 + index * 18,
        width: 100,
      },
    ]).flat()
    const spans = [
      { id: "a", text: "A", x: 286, y: 100, width: 10 },
      { id: "bstract", text: "BSTRACT", x: 299, y: 100, width: 64 },
      ...pairedChartLabels,
    ].map((span) => ({
      ...span,
      height: 14,
      fontSize: 12,
      fontWeight: 400,
    }))

    const lines = mergePdfTextLines(spans, 600)

    expect(lines.map((line) => line.text)).toContain("ABSTRACT")
    expect(lines.map((line) => line.text)).not.toContain("A")
  })

  it("separates small chart labels from neighboring body prose on the same row", () => {
    const lines = mergePdfTextLines(
      [
        {
          id: "body",
          text: "Figure 9 illustrates the diverse task distribution within",
          x: 60,
          y: 200,
          width: 250,
          height: 14,
          fontSize: 12,
          fontWeight: 400,
        },
        {
          id: "chart-label",
          text: "Analysis",
          x: 312,
          y: 201,
          width: 42,
          height: 7,
          fontSize: 6,
          fontWeight: 400,
        },
      ],
      600,
    )

    expect(lines.map((line) => line.text)).toEqual([
      "Figure 9 illustrates the diverse task distribution within",
      "Analysis",
    ])
  })

  it("keeps adjacent two-column prose and a table caption as separate lines", () => {
    const lines = mergePdfTextLines(
      [
        {
          id: "left-prose",
          text: "The external suites were intentionally chosen",
          x: 60,
          y: 200,
          width: 275,
          height: 14,
          fontSize: 12,
          fontWeight: 400,
        },
        {
          id: "right-caption",
          text: "Table 5: External test set results.",
          x: 330,
          y: 200,
          width: 220,
          height: 14,
          fontSize: 12,
          fontWeight: 400,
        },
      ],
      600,
    )

    expect(lines.map((line) => line.text)).toEqual([
      "The external suites were intentionally chosen",
      "Table 5: External test set results.",
    ])
  })
})
