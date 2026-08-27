import { describe, expect, it } from "vitest"
import { detectPdfFeatures, type PdfTextSpan } from "../../src/renderer/lib/pdfFeatureDetection"

describe("PDF feature bounds under zoom", () => {
  it("keeps every stacked figure panel inside the candidate at 150 percent zoom", () => {
    const spans = [
      {
        id: "prose",
        text: "The preceding paragraph ends before the figure begins.",
        x: 610,
        y: 120,
        width: 430,
        height: 18,
        fontSize: 13.5,
        fontWeight: 400,
      },
      {
        id: "panel-a",
        text: "EHR Reasoning Tasks",
        x: 640,
        y: 250,
        width: 180,
        height: 18,
        fontSize: 13.5,
        fontWeight: 600,
      },
      {
        id: "panel-b",
        text: "Information Search",
        x: 640,
        y: 500,
        width: 160,
        height: 18,
        fontSize: 13.5,
        fontWeight: 600,
      },
      {
        id: "panel-c",
        text: "Clinical Decision-Making",
        x: 640,
        y: 700,
        width: 210,
        height: 18,
        fontSize: 13.5,
        fontWeight: 600,
      },
      {
        id: "caption",
        text: "Figure 1: Comparison between the previous EHR tasks and the proposed benchmark.",
        x: 610,
        y: 900,
        width: 440,
        height: 20,
        fontSize: 13.5,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]

    const features = detectPdfFeatures({
      pageNumber: 4,
      pageWidth: 1_190,
      pageHeight: 1_683,
      spans,
    })

    const figure = features.find((feature) => feature.kind === "figure")
    expect(figure?.rect.y).toBeLessThanOrEqual(250)
    expect(figure?.sourceSpanIds).toContain("panel-a")
  })
})
