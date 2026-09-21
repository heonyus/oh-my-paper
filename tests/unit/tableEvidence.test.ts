import { afterEach, describe, expect, it } from "vitest"
import {
  tableCardBody,
  tableEvidenceForStructure,
  tableEvidenceWithDocumentContext,
} from "../../src/renderer/lib/tableEvidence"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"

describe("table evidence", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("passes OCR cells and deterministic column extrema to the table request", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "a".repeat(64),
      parser: "Mistral-OCR-4.1",
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
      parser: "Mistral-OCR-4.1",
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
      parser: "Mistral-OCR-4.1",
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
