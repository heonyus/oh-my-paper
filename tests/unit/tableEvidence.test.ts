import { afterEach, describe, expect, it } from "vitest"
import {
  tableCardBody,
  tableEvidenceForStructure,
  tableEvidenceWithDocumentContext,
} from "../../src/renderer/lib/tableEvidence"
import { AI_SOURCE_EVIDENCE_MAX_CHARACTERS, aiRequestSchema } from "../../src/shared/aiIpc"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"

describe("table evidence", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("passes OCR cells and deterministic column extrema to the table request", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "a".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v1",
      pageNumber: 9,
      width: 1_000,
      height: 800,
      blocks: [
        {
          id: "page:9:block:0",
          label: "table",
          order: 0,
          bounds: { x: 100, y: 120, width: 800, height: 340 },
          content:
            "| Model | BLEU | Parameters |\n| --- | ---: | ---: |\n| base | 25.8 | 65M |\n| big | 26.4 | 213M |\n| small | 24.1 | 28M |",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
      ],
    })
    const evidence = tableEvidenceForStructure(
      page,
      {
        id: "page:9:block:0",
        kind: "table",
        page: 9,
        title: "Table 3",
        quote: "Table 3: Results",
        bounds: { x: 100, y: 120, width: 800, height: 340 },
      },
      1_000,
      800,
    )

    expect(evidence).toContain("26.4")
    expect(evidence).toContain("213M")
    expect(evidence).toContain("28M")
    expect(evidence).toContain('열 "BLEU"의 최대값은 26.4')
  })

  it("ignores labels and citations while accepting commas and exponents", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "b".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v1",
      pageNumber: 2,
      width: 600,
      height: 800,
      blocks: [
        {
          id: "page:2:block:0",
          label: "table",
          order: 0,
          bounds: { x: 50, y: 100, width: 500, height: 220 },
          content:
            "| Model | Count |\n| --- | ---: |\n| Transformer (big) [28] | 1,024 |\n| baseline | 1e3 |\n| empty |  |",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
      ],
    })
    const evidence = tableEvidenceForStructure(
      page,
      {
        id: "page:2:block:0",
        kind: "table",
        page: 2,
        title: "Table 2",
        quote: "Table 2: Counts",
        bounds: { x: 50, y: 100, width: 500, height: 220 },
      },
      600,
      800,
    )

    expect(evidence).toContain("최대값은 1,024")
    expect(evidence).toContain("최소값은 1e3")
    expect(evidence).not.toContain("최대값은 28")
  })

  it("adds retrieved document text for symbol definitions", () => {
    const page = document.createElement("div")
    page.className = "page"
    page.setAttribute("data-page-number", "8")
    const layer = document.createElement("div")
    layer.className = "textLayer"
    const span = document.createElement("span")
    span.textContent = "Regularization uses label smoothing with epsilon_ls = 0.1."
    layer.append(span)
    page.append(layer)
    document.body.append(page)

    const parsedPage = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "c".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v1",
      pageNumber: 9,
      width: 600,
      height: 800,
      blocks: [
        {
          id: "page:9:block:0",
          label: "table",
          order: 0,
          bounds: { x: 50, y: 100, width: 500, height: 220 },
          content: "| epsilon_{ls} | Value |\n| --- | --- |\n| base | 0.1 |\n| big | 0.2 |",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
      ],
    })
    const evidence = tableEvidenceWithDocumentContext(
      parsedPage,
      {
        id: "page:9:block:0",
        kind: "table",
        page: 9,
        title: "Table 3",
        quote: "Table 3: Variations",
        bounds: { x: 50, y: 100, width: 500, height: 220 },
      },
      600,
      800,
      "symbol definition regularization",
    )

    expect(evidence).toContain("label smoothing")
  })

  it("keeps a page-sized table inside the request's evidence limit", () => {
    const rows = Array.from(
      { length: 400 },
      (_, index) => `| patient subgroup number ${index} | ${index} | 0.${index % 100} |`,
    )
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "d".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v1",
      pageNumber: 7,
      width: 1_000,
      height: 1_400,
      blocks: [
        {
          id: "page:7:block:1",
          label: "table",
          order: 1,
          bounds: { x: 60, y: 120, width: 880, height: 1_200 },
          content: [
            "| Subgroup | Cohort size | Raw score |",
            "| --- | ---: | ---: |",
            ...rows,
          ].join("\n"),
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
      ],
    })
    const structure = {
      id: "page:7:block:1",
      kind: "table" as const,
      page: 7,
      title: "Supplementary Table 5",
      quote: "Supplementary Table 5: Model calibration in patient subgroups",
      bounds: { x: 60, y: 120, width: 880, height: 1_200 },
    }

    expect(tableEvidenceForStructure(page, structure, 1_000, 1_400)?.length ?? 0).toBeGreaterThan(
      AI_SOURCE_EVIDENCE_MAX_CHARACTERS,
    )
    const evidence = tableEvidenceWithDocumentContext(page, structure, 1_000, 1_400, "calibration")

    expect(evidence).not.toBeNull()
    expect(evidence?.length ?? 0).toBeLessThanOrEqual(AI_SOURCE_EVIDENCE_MAX_CHARACTERS)
    expect(evidence).toContain("| Subgroup | Cohort size | Raw score |")
    expect(evidence).toContain("| patient subgroup number 0 |")
    expect(evidence).toContain('열 "Cohort size"의 최대값은 399')
    expect(
      aiRequestSchema.safeParse({
        action: "table",
        documentId: "be97e47c63d3cb14",
        page: 7,
        quote: structure.quote,
        before: "",
        after: "",
        sourceEvidence: evidence,
      }).success,
    ).toBe(true)
  })

  it("gives retrieved passages only the room the table leaves", () => {
    const rows = Array.from({ length: 20 }, (_, index) => `| row ${index} | ${index} |`)
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "e".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v1",
      pageNumber: 3,
      width: 1_000,
      height: 800,
      blocks: [
        {
          id: "page:3:block:0",
          label: "table",
          order: 0,
          bounds: { x: 100, y: 100, width: 800, height: 400 },
          content: ["| Name | Count |", "| --- | ---: |", ...rows].join("\n"),
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
      ],
    })
    const structure = {
      id: "page:3:block:0",
      kind: "table" as const,
      page: 3,
      title: "Table 1",
      quote: "Table 1: Counts",
      bounds: { x: 100, y: 100, width: 800, height: 400 },
    }
    const table = tableEvidenceForStructure(page, structure, 1_000, 800) ?? ""

    const tight = tableEvidenceWithDocumentContext(
      page,
      structure,
      1_000,
      800,
      "",
      table.length + 60,
    )

    expect(tight).toBe(table)
  })

  it("removes unsupported extrema claims before appending verified facts", () => {
    const body = tableCardBody(
      "최대 BLEU는 26.2입니다.\nN이 증가하면 항상 좋아집니다.",
      ['열 "BLEU"의 최대값은 26.4, 최소값은 23.7입니다.'],
      "Page 8: Label Smoothing uses epsilon_ls = 0.1.",
    )

    expect(body).not.toContain("26.2")
    expect(body).toContain("26.4")
    expect(body).toContain("Label Smoothing")
  })

  it("preserves extrema text when no verified facts are available", () => {
    const body = tableCardBody("최대값은 26.2입니다.", [], "")

    expect(body).toContain("26.2")
  })
})
