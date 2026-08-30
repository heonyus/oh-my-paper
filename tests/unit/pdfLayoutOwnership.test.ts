import { describe, expect, it } from "vitest"
import { detectPdfFeatures, type PdfTextSpan } from "../../src/renderer/lib/pdfFeatureDetection"

function span(
  id: string,
  text: string,
  x: number,
  y: number,
  width: number,
  fontSize = 9,
): PdfTextSpan {
  return { id, text, x, y, width, height: fontSize + 2, fontSize, fontWeight: 400 }
}

describe("PDF layout ownership", () => {
  it("does not classify a body sentence beginning with a count as a section", () => {
    const features = detectPdfFeatures({
      pageNumber: 1,
      pageWidth: 600,
      pageHeight: 800,
      spans: [
        span(
          "count-sentence",
          "29 LLMs reveals substantial performance disparities in biomedical data science",
          60,
          120,
          440,
          10,
        ),
      ],
    })

    expect(features).toEqual([])
  })

  it("keeps a top-caption table separate from the following figure", () => {
    const features = detectPdfFeatures({
      pageNumber: 8,
      pageWidth: 600,
      pageHeight: 800,
      spans: [
        span("table-caption", "Table 4: Med-Copilot performance.", 60, 60, 480, 11),
        span("table-header", "Datasets MIMIC-III eICU TREQS Score", 60, 90, 480, 8),
        span("table-row-1", "Qwen +SFT 57.83 61.48 72.66", 60, 106, 480, 8),
        span("table-row-2", "Qwen +GRPO 68.78 69.34 76.84", 60, 122, 480, 8),
        span("chart-title", "Inference-Time Scaling Training-Time Scaling", 60, 162, 480, 8),
        span("chart-axis", "Success Rate 20 30 40 50", 60, 180, 480, 7),
        span("figure-caption", "Figure 4: Scalable improvements of LLM agents.", 60, 260, 480),
      ],
    })
    const table = features.find((feature) => feature.kind === "table")
    const figure = features.find((feature) => feature.kind === "figure")

    expect(table?.sourceSpanIds).toEqual([
      "table-caption",
      "table-header",
      "table-row-1",
      "table-row-2",
    ])
    expect((table?.rect.y ?? 0) + (table?.rect.height ?? 0)).toBeLessThan(162)
    expect(figure?.sourceSpanIds).toContain("chart-title")
    expect(figure?.sourceSpanIds).not.toContain("table-row-2")
  })

  it("stops a table before prose and preserves appendix headings", () => {
    const features = detectPdfFeatures({
      pageNumber: 20,
      pageWidth: 600,
      pageHeight: 800,
      spans: [
        span("a3", "A.3 PRIVACY STATEMENTS", 60, 50, 220, 10),
        span("caption", "Table 6: Data Access and License Information.", 60, 90, 480, 11),
        span("header", "Dataset Data License Data Access", 60, 125, 480, 8),
        span("row-1", "MIMIC-III Custom PhysioNet", 60, 141, 480, 8),
        span("row-2", "eICU Custom PhysioNet", 60, 157, 480, 8),
        span(
          "prose",
          "Data Privacy and Licensing. We carefully curated datasets with strict adherence.",
          60,
          205,
          480,
          10,
        ),
        span("b", "B ADDITIONAL RELATED WORKS", 60, 300, 260, 10),
      ],
    })
    const table = features.find((feature) => feature.kind === "table")
    const sectionLabels = features
      .filter((feature) => feature.kind === "heading" || feature.kind === "subheading")
      .map((feature) => feature.label)

    expect(table?.sourceSpanIds).toEqual(["caption", "header", "row-1", "row-2"])
    expect((table?.rect.y ?? 0) + (table?.rect.height ?? 0)).toBeLessThan(205)
    expect(sectionLabels).toContain("A.3 PRIVACY STATEMENTS")
    expect(sectionLabels).toContain("B ADDITIONAL RELATED WORKS")
  })

  it("preserves appendix subheadings next to a column figure", () => {
    const features = detectPdfFeatures({
      pageNumber: 22,
      pageWidth: 600,
      pageHeight: 800,
      spans: [
        span("c", "C TASK AND DATA DETAILS", 60, 70, 230, 10),
        span("c1", "C.1 OVERVIEW", 60, 105, 120, 9),
        span(
          "body",
          "We refer to coding-based biomedical reasoning when agents write and run code.",
          60,
          145,
          250,
          9,
        ),
        span("chart", "Point-of-Care 48.3% Knowledge Retrieval", 360, 180, 170, 7),
        span("caption", "Figure 9: Diversity analysis.", 360, 300, 170, 9),
      ],
    })
    const figure = features.find((feature) => feature.kind === "figure")
    const sectionLabels = features
      .filter((feature) => feature.kind === "heading" || feature.kind === "subheading")
      .map((feature) => feature.label)

    expect(sectionLabels).toEqual(["C TASK AND DATA DETAILS", "C.1 OVERVIEW"])
    expect(figure?.rect.x).toBeGreaterThanOrEqual(300)
    expect(figure?.sourceSpanIds).toContain("chart")
    expect(figure?.sourceSpanIds).not.toContain("body")
  })

  it("keeps a right-column table out of neighboring prose", () => {
    const features = detectPdfFeatures({
      pageNumber: 25,
      pageWidth: 600,
      pageHeight: 800,
      spans: [
        span("caption", "Table 7: Trajectory Composition (%).", 340, 100, 210, 9),
        span("left-fragment", "The external suites were inten-", 60, 140, 240, 9),
        span("header", "Actions request info terminal code debug", 340, 140, 210, 8),
        span("row-1", "MIMIC-III 71.07 0 28.84 0.08", 340, 158, 210, 8),
        span("row-2", "MedAgentGym 32.71 1.76 85.79 12.46", 340, 176, 210, 8),
      ],
    })
    const table = features.find((feature) => feature.kind === "table")

    expect(table?.rect.x).toBeGreaterThanOrEqual(300)
    expect(table?.sourceSpanIds).not.toContain("left-fragment")
  })

  it("uses a caption-local fallback for a small floated figure", () => {
    const features = detectPdfFeatures({
      pageNumber: 27,
      pageWidth: 600,
      pageHeight: 800,
      spans: [
        span(
          "prose",
          "The model generates flexible and contextually appropriate code without predefined tools.",
          60,
          330,
          410,
          9,
        ),
        span("caption", "Figure 11: Effect of toolset.", 470, 500, 90, 9),
      ],
    })
    const figure = features.find((feature) => feature.kind === "figure")

    expect(figure?.rect.x).toBeGreaterThanOrEqual(430)
    expect(figure?.rect.width).toBeLessThan(170)
  })
})
