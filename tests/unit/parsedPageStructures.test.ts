import { describe, expect, it } from "vitest"
import { refineParsedStructureBounds } from "../../src/renderer/lib/parsedPageStructureBounds"
import { parsedPageStructures } from "../../src/renderer/lib/parsedPageStructures"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"

describe("Paddle page structures", () => {
  it("projects headings, figures, tables, and equations into rendered page geometry", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "e".repeat(64),
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 2,
      width: 1_000,
      height: 2_000,
      blocks: [
        {
          id: "page:2:block:0",
          label: "paragraph_title",
          order: 0,
          bounds: { x: 100, y: 100, width: 500, height: 60 },
          content: "2 Methods",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:2:block:1",
          label: "image",
          order: 1,
          bounds: { x: 100, y: 250, width: 800, height: 500 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:2:block:2",
          label: "figure_title",
          order: 2,
          bounds: { x: 100, y: 760, width: 800, height: 80 },
          content: "Figure 1. Architecture",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
        {
          id: "page:2:block:3",
          label: "equation",
          order: 3,
          bounds: { x: 200, y: 1_000, width: 600, height: 120 },
          content: "$$z = Wx$$",
          contentFormat: "latex",
          translationPolicy: "include",
        },
      ],
    })

    const structures = parsedPageStructures(page, 500, 1_000)

    expect(structures.map((structure) => structure.kind)).toEqual(["section", "figure", "equation"])
    expect(structures[1]).toMatchObject({
      title: "Figure 1. Architecture",
      bounds: { x: 50, y: 125, width: 400, height: 250 },
    })
  })

  it("associates captions by geometry instead of reading-order proximity", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "f".repeat(64),
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 1,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:1:block:0",
          label: "image",
          order: 0,
          bounds: { x: 40, y: 100, width: 400, height: 300 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:1",
          label: "image",
          order: 1,
          bounds: { x: 560, y: 100, width: 400, height: 300 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:2",
          label: "figure_title",
          order: 2,
          bounds: { x: 560, y: 420, width: 400, height: 40 },
          content: "Figure 2. Right",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:3",
          label: "figure_title",
          order: 3,
          bounds: { x: 40, y: 420, width: 400, height: 40 },
          content: "Figure 1. Left",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
      ],
    })

    expect(parsedPageStructures(page, 1_000, 1_000).map((structure) => structure.title)).toEqual([
      "Figure 1. Left",
      "Figure 2. Right",
    ])
  })

  it("keeps a table structure on the body bounds when its numbered caption is separate", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "b".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v2",
      pageNumber: 9,
      width: 791,
      height: 1_023,
      blocks: [
        {
          id: "page:9:block:0",
          label: "table_title",
          order: 0,
          bounds: { x: 135, y: 90, width: 517, height: 58 },
          content: "Table 3: Variations on the Transformer architecture.",
          contentFormat: "text",
          translationPolicy: "include",
        },
        {
          id: "page:9:block:1",
          label: "table",
          order: 1,
          bounds: { x: 137, y: 165, width: 522, height: 333 },
          content: "| base | 6 |",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
      ],
    })

    expect(parsedPageStructures(page, 791, 1_023)).toMatchObject([
      {
        kind: "table",
        title: "Table 3: Variations on the Transformer architecture.",
        bounds: { x: 137, y: 165, width: 522, height: 333 },
      },
    ])
  })

  it("matches the OCR gold body bounds for Tables 2 and 3", () => {
    const pages = [
      parsedDocumentPageSchema.parse({
        schemaVersion: "1.0.0",
        sourceHash: "c".repeat(64),
        parser: "PDF.js+PaddleOCR-VL-1.6",
        configVersion: "blocks-v2",
        pageNumber: 8,
        width: 791,
        height: 1_023,
        blocks: [
          {
            id: "page:8:block:0",
            label: "table_title",
            order: 0,
            bounds: { x: 135, y: 90, width: 517, height: 30 },
            content: "Table 2: The Transformer achieves better BLEU scores.",
            contentFormat: "text",
            translationPolicy: "include",
          },
          {
            id: "page:8:block:1",
            label: "table",
            order: 1,
            bounds: { x: 166, y: 121, width: 458, height: 194 },
            content: "| Model | BLEU |",
            contentFormat: "markdown",
            translationPolicy: "exclude",
          },
        ],
      }),
      parsedDocumentPageSchema.parse({
        schemaVersion: "1.0.0",
        sourceHash: "c".repeat(64),
        parser: "PDF.js+PaddleOCR-VL-1.6",
        configVersion: "blocks-v2",
        pageNumber: 9,
        width: 791,
        height: 1_023,
        blocks: [
          {
            id: "page:9:block:0",
            label: "table_title",
            order: 0,
            bounds: { x: 135, y: 90, width: 517, height: 58 },
            content: "Table 3: Variations on the Transformer architecture.",
            contentFormat: "text",
            translationPolicy: "include",
          },
          {
            id: "page:9:block:1",
            label: "table",
            order: 1,
            bounds: { x: 137, y: 165, width: 522, height: 333 },
            content: "| Model | BLEU |",
            contentFormat: "markdown",
            translationPolicy: "exclude",
          },
        ],
      }),
    ]

    expect(pages.map((page) => parsedPageStructures(page, 791, 1_023)[0])).toMatchObject([
      { kind: "table", bounds: { x: 166, y: 121, width: 458, height: 194 } },
      { kind: "table", bounds: { x: 137, y: 165, width: 522, height: 333 } },
    ])
  })

  it("gives an uncaptioned table a non-empty quote", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "e".repeat(64),
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 5,
      width: 1_000,
      height: 2_000,
      blocks: [
        {
          id: "page:5:block:0",
          label: "table",
          order: 0,
          bounds: { x: 100, y: 200, width: 800, height: 900 },
          content: "| Feature type | Conditions |",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
      ],
    })

    expect(parsedPageStructures(page, 500, 1_000)).toMatchObject([
      { kind: "table", title: "Table", quote: "Table" },
    ])
  })

  it("refines only visual structures through the shared rendered-pixel seam", () => {
    const structures = [
      {
        id: "section",
        kind: "section",
        page: 1,
        title: "Methods",
        quote: "Methods",
        bounds: { x: 20, y: 20, width: 200, height: 30 },
      },
      {
        id: "figure",
        kind: "figure",
        page: 1,
        title: "Figure 1",
        quote: "Figure 1",
        bounds: { x: 40, y: 100, width: 500, height: 400 },
      },
    ] as const

    const refined = refineParsedStructureBounds(structures, (bounds) => ({
      ...bounds,
      x: bounds.x + 5,
      width: bounds.width - 10,
    }))

    expect(refined[0]?.bounds).toEqual(structures[0]?.bounds)
    expect(refined[1]?.bounds).toEqual({ x: 45, y: 100, width: 490, height: 400 })
  })

  it("groups adjacent multi-panel images and removes nested chart blocks", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "a".repeat(64),
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 3,
      width: 1_191,
      height: 1_582,
      blocks: [
        {
          id: "page:3:block:0",
          label: "figure_title",
          order: 0,
          bounds: { x: 183, y: 320, width: 135, height: 31 },
          content: "a Data preparation",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
        {
          id: "page:3:block:1",
          label: "image",
          order: 1,
          bounds: { x: 171, y: 360, width: 851, height: 214 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:3:block:2",
          label: "chart",
          order: 2,
          bounds: { x: 789, y: 362, width: 235, height: 208 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:3:block:3",
          label: "image",
          order: 3,
          bounds: { x: 190, y: 673, width: 469, height: 122 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:3:block:4",
          label: "image",
          order: 4,
          bounds: { x: 696, y: 660, width: 324, height: 143 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:3:block:5",
          label: "image",
          order: 5,
          bounds: { x: 186, y: 880, width: 474, height: 120 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:3:block:6",
          label: "image",
          order: 6,
          bounds: { x: 721, y: 873, width: 301, height: 127 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:3:block:7",
          label: "image",
          order: 7,
          bounds: { x: 257, y: 1_072, width: 674, height: 162 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:3:block:8",
          label: "image",
          order: 8,
          bounds: { x: 303, y: 1_296, width: 619, height: 173 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
      ],
    })

    const figures = parsedPageStructures(page, 1_191, 1_582).filter(
      (structure) => structure.kind === "figure",
    )

    expect(figures).toHaveLength(1)
    expect(figures[0]?.bounds).toEqual({ x: 171, y: 320, width: 851, height: 1_149 })
  })
})
