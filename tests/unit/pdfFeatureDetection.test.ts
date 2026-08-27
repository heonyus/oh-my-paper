import { describe, expect, it } from "vitest"
import { detectPdfFeatures, type PdfTextSpan } from "../../src/renderer/lib/pdfFeatureDetection"

describe("PDF feature detection", () => {
  it("detects headings, subheadings, equations, and citations without body noise", () => {
    const spans = [
      {
        id: "h",
        text: "2 Related Work",
        x: 72,
        y: 80,
        width: 130,
        height: 18,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "sh",
        text: "2.1 Agents and Clinical Intelligence",
        x: 72,
        y: 124,
        width: 240,
        height: 15,
        fontSize: 11,
        fontWeight: 700,
      },
      {
        id: "body",
        text: "Clinical agents retrieve heterogeneous patient data.",
        x: 72,
        y: 164,
        width: 260,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "eq",
        text: "S_t = (R_t + P_t + C_t) / 6 (1)",
        x: 72,
        y: 220,
        width: 220,
        height: 18,
        fontSize: 12,
        fontWeight: 400,
      },
      {
        id: "cite",
        text: "Recent work [12, 14] improves retrieval.",
        x: 72,
        y: 264,
        width: 240,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 1, pageWidth: 600, pageHeight: 800, spans })

    expect(features.map((feature) => feature.kind)).toEqual([
      "heading",
      "subheading",
      "equation",
      "citation",
    ])
    expect(features.find((feature) => feature.kind === "heading")?.label).toBe("2 Related Work")
    expect(features.find((feature) => feature.kind === "equation")?.label).toBe("Equation (1)")
  })

  it("infers nearby figure and table regions from their captions", () => {
    const spans = [
      {
        id: "figure-shape",
        text: "Agent",
        x: 185,
        y: 180,
        width: 70,
        height: 16,
        fontSize: 10,
        fontWeight: 400,
      },
      {
        id: "figure-caption",
        text: "Figure 1: Agent architecture",
        x: 120,
        y: 290,
        width: 190,
        height: 13,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "table-row",
        text: "Method   Score   Recall",
        x: 410,
        y: 340,
        width: 120,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "table-caption",
        text: "Table 2. Results on CN-EHR",
        x: 390,
        y: 430,
        width: 170,
        height: 13,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 3, pageWidth: 600, pageHeight: 800, spans })
    const figure = features.find((feature) => feature.kind === "figure")
    const table = features.find((feature) => feature.kind === "table")

    expect(figure?.label).toBe("Figure 1")
    expect(figure?.context).toContain("Agent architecture")
    expect(figure?.rect.y).toBeLessThan(290)
    expect((figure?.rect.y ?? 0) + (figure?.rect.height ?? 0)).toBeLessThanOrEqual(290)
    expect(table?.label).toBe("Table 2")
    expect(table?.context).toContain("Results on CN-EHR")
    expect((table?.rect.y ?? 0) + (table?.rect.height ?? 0)).toBeLessThanOrEqual(430)
    expect(table?.priority).toBeGreaterThan(figure?.priority ?? 0)
  })

  it("uses page-local rectangles and rejects empty or ordinary spans", () => {
    const spans = [
      { id: "empty", text: "   ", x: 0, y: 0, width: 0, height: 0, fontSize: 9, fontWeight: 400 },
      {
        id: "body",
        text: "This sentence has no structural marker.",
        x: 36,
        y: 100,
        width: 240,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 7, pageWidth: 500, pageHeight: 700, spans })

    expect(features).toEqual([])
  })

  it("merges adjacent multiline title rows into one heading", () => {
    const spans = [
      {
        id: "title-1",
        text: "SAMPLEAGENT: Advancing Autonomous Clinical Decision-Making",
        x: 100,
        y: 44,
        width: 400,
        height: 18,
        fontSize: 16,
        fontWeight: 700,
      },
      {
        id: "title-2",
        text: "via Retrospective Summarization",
        x: 160,
        y: 65,
        width: 280,
        height: 18,
        fontSize: 16,
        fontWeight: 700,
      },
      {
        id: "body",
        text: "Large language models are useful.",
        x: 72,
        y: 130,
        width: 220,
        height: 10,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 1, pageWidth: 600, pageHeight: 800, spans })
    const headings = features.filter((feature) => feature.kind === "heading")

    expect(headings).toHaveLength(1)
    expect(headings[0]?.label).toContain("via Retrospective Summarization")
    expect(headings[0]?.sourceSpanIds).toEqual(["title-1", "title-2"])
  })

  it("keeps a two-column figure region out of the neighboring body column", () => {
    const spans = [
      {
        id: "body-left",
        text: "Abstract body text in the left column",
        x: 70,
        y: 150,
        width: 250,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "figure-label",
        text: "Doctor Agent EHR",
        x: 330,
        y: 250,
        width: 170,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "body-left-parallel",
        text: "A long left-column line overlaps the gutter threshold",
        x: 70,
        y: 250,
        width: 250,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "body-right-above",
        text: "Same-column prose must not become part of the figure.",
        x: 330,
        y: 170,
        width: 200,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "figure-caption",
        text: "Figure 1: Comparison between EHR tasks",
        x: 315,
        y: 300,
        width: 220,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 1, pageWidth: 600, pageHeight: 800, spans })
    const figure = features.find((feature) => feature.kind === "figure")

    expect(figure?.rect.x).toBeGreaterThanOrEqual(300)
    expect(figure?.sourceSpanIds).not.toContain("body-left")
    expect(figure?.sourceSpanIds).not.toContain("body-left-parallel")
    expect(figure?.sourceSpanIds).not.toContain("body-right-above")
  })

  it("keeps both panels of a full-width figure", () => {
    const spans = [
      {
        id: "left-panel",
        text: "EHR Database",
        x: 60,
        y: 180,
        width: 180,
        height: 14,
        fontSize: 10,
        fontWeight: 700,
      },
      {
        id: "right-panel",
        text: "Experience Memory Bank",
        x: 360,
        y: 180,
        width: 180,
        height: 14,
        fontSize: 10,
        fontWeight: 700,
      },
      {
        id: "caption",
        text: "Figure 2: Overview of the full framework and memory system.",
        x: 50,
        y: 360,
        width: 500,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 4, pageWidth: 600, pageHeight: 800, spans })
    const figure = features.find((feature) => feature.kind === "figure")

    expect(figure?.sourceSpanIds).toContain("left-panel")
    expect(figure?.sourceSpanIds).toContain("right-panel")
    expect(figure?.rect.width).toBeGreaterThan(480)
  })

  it("keeps three side-by-side figures as independent targets", () => {
    const spans = [
      { id: "chart-5", text: "Sample Num", x: 30, y: 110, width: 150 },
      { id: "chart-6", text: "Best@K F1 Score", x: 225, y: 110, width: 150 },
      { id: "chart-7", text: "Context Length", x: 420, y: 110, width: 150 },
      { id: "caption-5", text: "Figure 5: Interaction turns.", x: 30, y: 260, width: 150 },
      { id: "caption-6", text: "Figure 6: Test-time scaling.", x: 225, y: 260, width: 150 },
      { id: "caption-7", text: "Figure 7: Context sensitivity.", x: 420, y: 260, width: 150 },
    ].map((span) => ({
      ...span,
      height: 12,
      fontSize: 9,
      fontWeight: 400,
    })) satisfies readonly PdfTextSpan[]

    const figures = detectPdfFeatures({ pageNumber: 9, pageWidth: 600, pageHeight: 800, spans })
      .filter((feature) => feature.kind === "figure")
      .sort((left, right) => left.rect.x - right.rect.x)

    expect(figures).toHaveLength(3)
    expect(figures[0]?.sourceSpanIds).toContain("chart-5")
    expect(figures[0]?.sourceSpanIds).not.toContain("chart-6")
    expect(figures[1]?.sourceSpanIds).toContain("chart-6")
    expect(figures[1]?.sourceSpanIds).not.toContain("chart-7")
    expect(figures[2]?.sourceSpanIds).toContain("chart-7")
  })

  it("suppresses citation actions contained inside a detected table", () => {
    const spans = [
      {
        id: "table-row-1",
        text: "ReSum (Wu et al., 2025)",
        x: 80,
        y: 130,
        width: 160,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "table-row-2",
        text: "MEM1 (Zhou et al., 2025)",
        x: 80,
        y: 148,
        width: 170,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "table-caption",
        text: "Table 1: Comparison of previous works",
        x: 120,
        y: 220,
        width: 350,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 2, pageWidth: 600, pageHeight: 800, spans })

    expect(features.filter((feature) => feature.kind === "table")).toHaveLength(1)
    expect(features.filter((feature) => feature.kind === "citation")).toHaveLength(0)
  })

  it("detects numbered display equations but rejects inline prose math", () => {
    const spans = [
      {
        id: "prose",
        text: "The tuple is appended to the history H_i = H_{i-1} U {(a_i, o_i)}.",
        x: 72,
        y: 200,
        width: 420,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "compact-prose",
        text: "X = {p, t, I}, where p is the patient identifier.",
        x: 330,
        y: 220,
        width: 230,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "display-equation",
        text: "S_t = (R_t + P_t + C_t) / 6 (1)",
        x: 150,
        y: 260,
        width: 260,
        height: 16,
        fontSize: 11,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 3, pageWidth: 600, pageHeight: 800, spans })
    const equations = features.filter((feature) => feature.kind === "equation")

    expect(equations).toHaveLength(1)
    expect(equations[0]?.sourceSpanIds).toEqual(["display-equation"])
    expect(equations[0]?.label).toBe("Equation (1)")
  })

  it("groups a split display equation number with the math line", () => {
    const spans = [
      {
        id: "eq-body",
        text: "a_i ∼ π_θ(a_i | H_{i-1}, X)",
        x: 140,
        y: 260,
        width: 280,
        height: 16,
        fontSize: 11,
        fontWeight: 400,
      },
      {
        id: "eq-num",
        text: "(1)",
        x: 520,
        y: 262,
        width: 22,
        height: 14,
        fontSize: 11,
        fontWeight: 400,
      },
      {
        id: "eq2-body",
        text: "o_i = E(a_i)",
        x: 220,
        y: 300,
        width: 140,
        height: 16,
        fontSize: 11,
        fontWeight: 400,
      },
      {
        id: "eq2-num",
        text: "(2)",
        x: 520,
        y: 302,
        width: 22,
        height: 14,
        fontSize: 11,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 3, pageWidth: 600, pageHeight: 800, spans })
    const equations = features.filter((feature) => feature.kind === "equation")

    expect(equations.map((feature) => feature.label)).toEqual(["Equation (1)", "Equation (2)"])
    expect(equations[0]?.sourceSpanIds).toEqual(["eq-body", "eq-num"])
    expect((equations[0]?.rect.width ?? 0) > 280).toBe(true)
  })

  it("keeps a multiline equation in its column and excludes adjacent prose", () => {
    const spans = [
      {
        id: "left-prose",
        text: "summarization window size w. The summary continues here",
        x: 60,
        y: 260,
        width: 230,
        height: 14,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "equation-top",
        text: "H_i = { S_i + H_{i-1}",
        x: 350,
        y: 238,
        width: 150,
        height: 16,
        fontSize: 11,
        fontWeight: 400,
      },
      {
        id: "same-column-intro",
        text: "its own policy π θ :",
        x: 350,
        y: 218,
        width: 150,
        height: 16,
        fontSize: 11,
        fontWeight: 400,
      },
      {
        id: "equation-bottom",
        text: "H_i = H_{i-1} ∪ S_i",
        x: 350,
        y: 260,
        width: 160,
        height: 16,
        fontSize: 11,
        fontWeight: 400,
      },
      {
        id: "equation-number",
        text: "(4)",
        x: 560,
        y: 261,
        width: 24,
        height: 14,
        fontSize: 11,
        fontWeight: 400,
      },
      {
        id: "same-column-tail",
        text: "H_i = H_i ∪ S_i. This process repeats until the",
        x: 350,
        y: 280,
        width: 200,
        height: 16,
        fontSize: 11,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 4, pageWidth: 600, pageHeight: 800, spans })
    const equation = features.find((feature) => feature.kind === "equation")

    expect(equation?.sourceSpanIds).toEqual(["equation-top", "equation-bottom", "equation-number"])
    expect(equation?.rect.x).toBeGreaterThanOrEqual(300)
  })

  it("matches simultaneous two-column equations to the number in the same column", () => {
    const spans = [
      { id: "left-math", text: "Best@K F1 = max F1(t)", x: 60, y: 260, width: 190 },
      { id: "left-number", text: "(15)", x: 270, y: 262, width: 24 },
      { id: "right-math", text: "Best@N F1 = max F1(t)", x: 350, y: 260, width: 190 },
      { id: "right-number", text: "(17)", x: 560, y: 282, width: 24 },
    ].map((span) => ({
      ...span,
      height: 14,
      fontSize: 11,
      fontWeight: 400,
    })) satisfies readonly PdfTextSpan[]

    const equations = detectPdfFeatures({ pageNumber: 16, pageWidth: 600, pageHeight: 800, spans })
      .filter((feature) => feature.kind === "equation")
      .sort((left, right) => left.rect.x - right.rect.x)

    expect(equations.map((feature) => feature.label)).toEqual(["Equation (15)", "Equation (17)"])
    expect(equations[1]?.sourceSpanIds).toEqual(["right-math", "right-number"])
  })

  it("merges consecutive aligned equation rows into one hover target", () => {
    const spans = [
      { id: "eq-6", text: "E_act = R_theta(H_K, Y, Y*)", x: 120, y: 240, width: 250 },
      { id: "num-6", text: "(6)", x: 390, y: 242, width: 24 },
      { id: "eq-7", text: "E_sum = R_theta(H_K, S_final, Y, Y*)", x: 120, y: 262, width: 270 },
      { id: "num-7", text: "(7)", x: 390, y: 264, width: 24 },
    ].map((span) => ({
      ...span,
      height: 14,
      fontSize: 11,
      fontWeight: 400,
    })) satisfies readonly PdfTextSpan[]

    const equations = detectPdfFeatures({
      pageNumber: 6,
      pageWidth: 600,
      pageHeight: 800,
      spans,
    }).filter((feature) => feature.kind === "equation")

    expect(equations).toHaveLength(1)
    expect(equations[0]?.label).toBe("Equations (6)–(7)")
    expect(equations[0]?.sourceSpanIds).toEqual(["eq-6", "num-6", "eq-7", "num-7"])
    expect(equations[0]?.rect.height).toBeGreaterThan(30)
  })

  it("does not turn figure labels or table headers into AI targets", () => {
    const spans = [
      {
        id: "heading",
        text: "3 Methods",
        x: 70,
        y: 40,
        width: 110,
        height: 16,
        fontSize: 14,
        fontWeight: 700,
      },
      {
        id: "actor",
        text: "Actor",
        x: 90,
        y: 160,
        width: 48,
        height: 12,
        fontSize: 10,
        fontWeight: 700,
      },
      {
        id: "summarizer",
        text: "Summarizer",
        x: 180,
        y: 200,
        width: 72,
        height: 12,
        fontSize: 10,
        fontWeight: 700,
      },
      {
        id: "figure-caption",
        text: "Figure 2: Overview of RETROSUM",
        x: 80,
        y: 360,
        width: 280,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "methods-header",
        text: "Methods",
        x: 88,
        y: 420,
        width: 54,
        height: 11,
        fontSize: 9,
        fontWeight: 700,
      },
      {
        id: "ours-row",
        text: "RETROSUM (Ours)",
        x: 88,
        y: 520,
        width: 110,
        height: 11,
        fontSize: 9,
        fontWeight: 700,
      },
      {
        id: "cite-row",
        text: "ReSum (Wu et al., 2025)",
        x: 88,
        y: 470,
        width: 160,
        height: 11,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "table-caption",
        text: "Table 1: Comparison of previous works",
        x: 70,
        y: 580,
        width: 360,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 4, pageWidth: 600, pageHeight: 800, spans })

    expect(features.map((feature) => feature.kind).sort()).toEqual(["figure", "heading", "table"])
    expect(features.find((feature) => feature.kind === "heading")?.label).toBe("3 Methods")
    const table = features.find((feature) => feature.kind === "table")
    expect(table?.rect.y).toBeLessThan(420)
    expect((table?.rect.y ?? 0) + (table?.rect.height ?? 0)).toBeGreaterThan(520)
  })

  it("gives a textless figure a column window stopped by body prose", () => {
    const spans = [
      {
        id: "body-above",
        text: "Ablation studies confirm that interval length changes F1 quite substantially.",
        x: 80,
        y: 120,
        width: 420,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
      {
        id: "figure-caption",
        text: "Figure 3: Impact of summarization interval on agent performance.",
        x: 90,
        y: 420,
        width: 400,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 8, pageWidth: 600, pageHeight: 800, spans })
    const figure = features.find((feature) => feature.kind === "figure")

    expect(features).toHaveLength(1)
    expect(figure?.rect.y).toBeGreaterThan(120)
    expect(figure?.rect.y).toBeLessThan(200)
    expect(figure?.rect.width).toBeGreaterThan(380)
    expect((figure?.rect.y ?? 0) + (figure?.rect.height ?? 0)).toBeLessThanOrEqual(420)
  })

  it("does not treat zoomed body lines as section headings", () => {
    const spans = [
      {
        id: "heading",
        text: "1 Introduction",
        x: 72,
        y: 80,
        width: 140,
        height: 16,
        fontSize: 16,
        fontWeight: 700,
      },
      {
        id: "wrap",
        text: "through clinical reasoning, and finally deliver pre-",
        x: 72,
        y: 160,
        width: 310,
        height: 14,
        fontSize: 14,
        fontWeight: 400,
      },
      {
        id: "body",
        text: "dicted diagnoses, prescriptions, and procedures.",
        x: 72,
        y: 178,
        width: 300,
        height: 14,
        fontSize: 14,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 1, pageWidth: 600, pageHeight: 800, spans })

    expect(features.map((feature) => feature.kind)).toEqual(["heading"])
    expect(features[0]?.label).toBe("1 Introduction")
  })

  it("does not treat a two-letter math fragment as an appendix heading", () => {
    const spans = [
      {
        id: "math-fragment",
        text: "X N",
        x: 430,
        y: 620,
        width: 24,
        height: 18,
        fontSize: 11,
        fontWeight: 700,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 16, pageWidth: 600, pageHeight: 800, spans })

    expect(features).toEqual([])
  })

  it("does not treat an in-text Table reference as a table caption", () => {
    const spans = [
      {
        id: "body-reference",
        text: "Table 2 demonstrates the consistent superiority of RETROSUM across all tasks.",
        x: 330,
        y: 240,
        width: 230,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({ pageNumber: 5, pageWidth: 600, pageHeight: 800, spans })

    expect(features).toEqual([])
  })
})
