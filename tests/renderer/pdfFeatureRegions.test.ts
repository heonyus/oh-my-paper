import { describe, expect, it } from "vitest"
import {
  detectPdfFeatureRegions,
  type PdfOverlayFeature,
  type PdfOverlayPageInput,
} from "../../src/renderer/lib/pdfFeatureRegions"

describe("pdfFeatureRegions", () => {
  it("detects multi-part SampleAgent Figure 1 bounding box accurately excluding caption", () => {
    const page: PdfOverlayPageInput = {
      pageIndex: 0,
      width: 600,
      height: 800,
      blocks: [
        {
          id: "b-body-top",
          text: "We propose SampleAgent, an autonomous EHR navigation framework.",
          x: 50,
          y: 40,
          width: 500,
          height: 20,
        },
        {
          id: "b-fig1-caption",
          text: "Figure 1: Overview of the SampleAgent pipeline with observation and action loops.",
          x: 50,
          y: 360,
          width: 500,
          height: 25,
        },
        {
          id: "b-body-bottom",
          text: "As shown in Figure 1, the agent interacts with SQLite databases.",
          x: 50,
          y: 395,
          width: 500,
          height: 20,
        },
      ],
      graphics: [
        { x: 60, y: 80, width: 220, height: 260 },
        { x: 300, y: 80, width: 240, height: 260 },
        { x: 50, y: 70, width: 500, height: 280 },
      ],
    }

    const features = detectPdfFeatureRegions(page)
    const fig1 = features.find((f: PdfOverlayFeature) => f.kind === "figure")

    expect(fig1).toBeDefined()
    if (fig1 !== undefined) {
      expect(fig1.label).toBe("Figure 1")
      expect(fig1.caption).toBe(
        "Figure 1: Overview of the SampleAgent pipeline with observation and action loops.",
      )
      expect(fig1.boundingBox).toEqual({
        x: 50,
        y: 70,
        width: 500,
        height: 280,
      })
      expect(fig1.boundingBox.y + fig1.boundingBox.height).toBeLessThanOrEqual(360)
      expect(fig1.source).toBe("born_digital")
      expect(fig1.confidence).toBe(0.95)
    }
  })

  it("falls back to layout heuristic when no graphics are available", () => {
    const page: PdfOverlayPageInput = {
      pageIndex: 1,
      width: 600,
      height: 800,
      blocks: [
        {
          id: "b-fig2",
          text: "Figure 2: Performance comparison across MIMIC-IV cohorts.",
          x: 50,
          y: 250,
          width: 500,
          height: 20,
        },
      ],
      graphics: [],
    }

    const features = detectPdfFeatureRegions(page)
    const fig2 = features.find((f: PdfOverlayFeature) => f.kind === "figure")

    expect(fig2).toBeDefined()
    if (fig2 !== undefined) {
      expect(fig2.source).toBe("layout_heuristic")
      expect(fig2.confidence).toBe(0.7)
      expect(fig2.boundingBox.y + fig2.boundingBox.height).toBeLessThanOrEqual(250)
    }
  })
})
