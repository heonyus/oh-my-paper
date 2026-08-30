import { describe, expect, it } from "vitest"
import type { PdfFeature, PdfTextSpan } from "../../src/renderer/lib/pdfFeatureDetection"
import { applyModelLayoutBounds } from "../../src/renderer/lib/pdfModelLayout"
import type { DocumentLayoutPage } from "../../src/shared/documentLayout"

const spans = [
  { id: "table-caption", text: "Table 7: Results", x: 330, y: 100, width: 220 },
  { id: "figure-caption", text: "Figure 11: Effect", x: 470, y: 500, width: 90 },
].map((span) => ({
  ...span,
  height: 12,
  fontSize: 9,
  fontWeight: 400,
})) satisfies readonly PdfTextSpan[]

const features = [
  {
    kind: "table",
    pageNumber: 1,
    rect: { x: 50, y: 120, width: 500, height: 250 },
    label: "Table 7",
    context: "Table 7: Results",
    priority: 0.8,
    sourceSpanIds: ["table-caption"],
  },
  {
    kind: "figure",
    pageNumber: 1,
    rect: { x: 300, y: 300, width: 300, height: 190 },
    label: "Figure 11",
    context: "Figure 11: Effect",
    priority: 0.8,
    sourceSpanIds: ["figure-caption"],
  },
] satisfies readonly PdfFeature[]

const layoutPage = {
  pageNumber: 1,
  width: 1_200,
  height: 1_600,
  boxes: [
    { label: "table", score: 0.98, x: 660, y: 240, width: 440, height: 220 },
    { label: "chart", score: 0.95, x: 930, y: 640, width: 160, height: 320 },
  ],
} satisfies DocumentLayoutPage

describe("model PDF layout", () => {
  it("replaces heuristic bounds with exclusive model-owned boxes", () => {
    const applied = applyModelLayoutBounds(features, spans, layoutPage, 600, 800)

    expect(applied.features[0]?.rect).toEqual({ x: 330, y: 120, width: 220, height: 110 })
    expect(applied.features[1]?.rect).toEqual({ x: 465, y: 320, width: 80, height: 160 })
    expect(applied.boundFeatureKeys.size).toBe(2)
  })

  it("preserves fallback bounds when no model page is available", () => {
    const applied = applyModelLayoutBounds(features, spans, undefined, 600, 800)

    expect(applied.features).toBe(features)
    expect(applied.boundFeatureKeys.size).toBe(0)
  })

  it("assigns a lower chart to the nearer lower caption instead of an upper caption", () => {
    const twoFigures = [
      {
        kind: "figure",
        pageNumber: 1,
        rect: { x: 300, y: 250, width: 250, height: 130 },
        label: "Figure 9",
        context: "Figure 9",
        priority: 0.8,
        sourceSpanIds: ["figure-9-caption"],
      },
      {
        kind: "figure",
        pageNumber: 1,
        rect: { x: 300, y: 500, width: 250, height: 130 },
        label: "Figure 10",
        context: "Figure 10",
        priority: 0.8,
        sourceSpanIds: ["figure-10-caption"],
      },
    ] satisfies readonly PdfFeature[]
    const twoCaptions = [
      { id: "figure-9-caption", text: "Figure 9", x: 300, y: 390, width: 240 },
      { id: "figure-10-caption", text: "Figure 10", x: 450, y: 700, width: 100 },
    ].map((item) => ({
      ...item,
      height: 12,
      fontSize: 9,
      fontWeight: 400,
    })) satisfies readonly PdfTextSpan[]
    const lowerChart = {
      pageNumber: 1,
      width: 600,
      height: 800,
      boxes: [{ label: "chart", score: 0.95, x: 300, y: 520, width: 220, height: 120 }],
    } satisfies DocumentLayoutPage

    const applied = applyModelLayoutBounds(twoFigures, twoCaptions, lowerChart, 600, 800)

    expect(applied.features[0]?.rect).toEqual(twoFigures[0]?.rect)
    expect(applied.features[1]?.rect).toEqual({ x: 300, y: 520, width: 220, height: 120 })
  })

  it("keeps only the nearest table box for each table caption", () => {
    const competingTables = {
      ...layoutPage,
      boxes: [
        { label: "table", score: 0.99, x: 80, y: 500, width: 1_000, height: 300 },
        { label: "table", score: 0.98, x: 660, y: 240, width: 440, height: 220 },
      ],
    } satisfies DocumentLayoutPage

    const applied = applyModelLayoutBounds(features, spans, competingTables, 600, 800)

    expect(applied.features[0]?.rect).toEqual({ x: 330, y: 120, width: 220, height: 110 })
  })

  it("adds a model paragraph title when text heuristics miss the heading", () => {
    const titleSpan = {
      id: "unusual-title",
      text: "Materials & cohort construction",
      x: 60,
      y: 60,
      width: 250,
      height: 18,
      fontSize: 10,
      fontWeight: 400,
    } satisfies PdfTextSpan
    const titleLayout = {
      pageNumber: 1,
      width: 600,
      height: 800,
      boxes: [{ label: "paragraph_title", score: 0.92, x: 55, y: 55, width: 270, height: 28 }],
    } satisfies DocumentLayoutPage

    const applied = applyModelLayoutBounds([], [titleSpan], titleLayout, 600, 800)

    expect(applied.features).toHaveLength(1)
    expect(applied.features[0]?.kind).toBe("subheading")
    expect(applied.features[0]?.label).toBe("Materials & cohort construction")
  })

  it("does not union vertically separate charts under one figure caption", () => {
    const oneFigure = [
      {
        kind: "figure",
        pageNumber: 1,
        rect: { x: 300, y: 300, width: 250, height: 350 },
        label: "Figure 20",
        context: "Figure 20",
        priority: 0.8,
        sourceSpanIds: ["figure-20-caption"],
      },
    ] satisfies readonly PdfFeature[]
    const oneCaption = [
      {
        id: "figure-20-caption",
        text: "Figure 20",
        x: 300,
        y: 700,
        width: 250,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]
    const separateCharts = {
      pageNumber: 1,
      width: 600,
      height: 800,
      boxes: [
        { label: "chart", score: 0.9, x: 300, y: 100, width: 220, height: 120 },
        { label: "chart", score: 0.95, x: 300, y: 500, width: 220, height: 120 },
      ],
    } satisfies DocumentLayoutPage

    const applied = applyModelLayoutBounds(oneFigure, oneCaption, separateCharts, 600, 800)

    expect(applied.features[0]?.rect).toEqual({ x: 300, y: 500, width: 220, height: 120 })
  })

  it("unions a two-row multi-panel grid under its shared figure caption", () => {
    const oneFigure = [
      {
        kind: "figure",
        pageNumber: 1,
        rect: { x: 70, y: 80, width: 460, height: 430 },
        label: "Figure 4",
        context: "Figure 4",
        priority: 0.8,
        sourceSpanIds: ["figure-4-caption"],
      },
    ] satisfies readonly PdfFeature[]
    const caption = [
      {
        id: "figure-4-caption",
        text: "Figure 4",
        x: 70,
        y: 530,
        width: 460,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]
    const fourCharts = {
      pageNumber: 1,
      width: 600,
      height: 800,
      boxes: [
        { label: "chart", score: 0.96, x: 70, y: 80, width: 210, height: 180 },
        { label: "chart", score: 0.95, x: 320, y: 80, width: 210, height: 180 },
        { label: "chart", score: 0.97, x: 70, y: 300, width: 210, height: 180 },
        { label: "chart", score: 0.96, x: 320, y: 300, width: 210, height: 180 },
      ],
    } satisfies DocumentLayoutPage

    const applied = applyModelLayoutBounds(oneFigure, caption, fourCharts, 600, 800)

    expect(applied.features[0]?.rect).toEqual({ x: 70, y: 80, width: 460, height: 400 })
  })

  it("does not bridge a chained sequence of vertically drifting figure boxes", () => {
    const oneFigure = [
      {
        kind: "figure",
        pageNumber: 1,
        rect: { x: 300, y: 100, width: 220, height: 220 },
        label: "Figure 21",
        context: "Figure 21",
        priority: 0.8,
        sourceSpanIds: ["figure-21-caption"],
      },
    ] satisfies readonly PdfFeature[]
    const caption = [
      {
        id: "figure-21-caption",
        text: "Figure 21",
        x: 300,
        y: 700,
        width: 220,
        height: 12,
        fontSize: 9,
        fontWeight: 400,
      },
    ] satisfies readonly PdfTextSpan[]
    const chained = {
      pageNumber: 1,
      width: 600,
      height: 2_000,
      boxes: [
        { label: "chart", score: 0.95, x: 300, y: 100, width: 220, height: 100 },
        { label: "chart", score: 0.95, x: 300, y: 160, width: 220, height: 100 },
        { label: "chart", score: 0.95, x: 300, y: 220, width: 220, height: 100 },
      ],
    } satisfies DocumentLayoutPage

    const applied = applyModelLayoutBounds(oneFigure, caption, chained, 600, 2_000)

    expect(applied.features[0]?.rect).toEqual({ x: 300, y: 220, width: 220, height: 100 })
  })
})
