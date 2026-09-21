import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { afterEach, describe, expect, it } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import {
  clearActiveDocumentAst,
  setActiveDocumentAst,
} from "../../src/renderer/lib/documentAstRuntime"
import {
  clearParsedDocumentPages,
  loadParsedDocumentPage,
} from "../../src/renderer/lib/documentPageRuntime"
import {
  buildPdfRetrievalIndex,
  findPdfTextPage,
  paperContextForQuestion,
  preparePaperContextForQuestion,
  rankPdfPassages,
} from "../../src/renderer/lib/pdfSearch"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"
import { documentIdSchema } from "../../src/shared/schemas"

function addPage(pageNumber: number, text: string): void {
  const page = document.createElement("div")
  page.className = "page"
  page.setAttribute("data-page-number", String(pageNumber))
  const layer = document.createElement("div")
  layer.className = "textLayer"
  const span = document.createElement("span")
  span.textContent = text
  layer.append(span)
  page.append(layer)
  document.body.append(page)
}

const astDocumentId = documentIdSchema.parse("aabbccddeeff0011")

function textItem(text: string): TextItem {
  return {
    str: text,
    dir: "ltr",
    transform: [10, 0, 0, 10, 40, 740],
    width: text.length * 6,
    height: 10,
    fontName: "Helvetica",
    hasEOL: false,
  }
}

describe("PDF search context", () => {
  afterEach(() => {
    clearActiveDocumentAst(astDocumentId)
    clearParsedDocumentPages(astDocumentId)
    document.querySelectorAll(".page").forEach((page) => {
      page.remove()
    })
  })

  it("finds a page and ranks relevant paper context", () => {
    addPage(1, "Introduction to clinical agents")
    addPage(2, "Retrospective memory retrieval preserves long context")

    expect(findPdfTextPage("memory retrieval")).toBe(2)
    expect(paperContextForQuestion("How does memory retrieval work?", 1)).toMatch(
      /^Page 2: Retrospective memory retrieval/u,
    )
  })

  it("ranks the most relevant passage first when a query spans the document", () => {
    const index = buildPdfRetrievalIndex([
      "Scientific reading preserves provenance between claims and evidence.",
      "Variational evidence bounds optimize retrieval likelihood in latent space.",
      "The benchmark reports throughput latency and memory for every component.",
    ])

    const results = rankPdfPassages(index, "retrieval likelihood evidence")

    expect(results[0]?.page).toBe(2)
    expect(results[0]?.rank).toBe(1)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it("returns at most five passages in stable relevance order", () => {
    const pages = Array.from(
      { length: 8 },
      (_, index) => `Evidence retrieval appears on page ${index + 1} with supporting context.`,
    )
    const index = buildPdfRetrievalIndex(pages)

    const results = rankPdfPassages(index, "evidence retrieval")

    expect(results).toHaveLength(5)
    expect(results.map((result) => result.page)).toEqual([1, 2, 3, 4, 5])
  })

  it("starts and ends a clipped retrieval excerpt at word boundaries", () => {
    const prefix = "deterministic ".repeat(20)
    const suffix = " evidence".repeat(40)
    const results = rankPdfPassages(
      buildPdfRetrievalIndex([`${prefix}memory retrieval${suffix}`]),
      "memory retrieval",
    )

    expect(results[0]?.snippet).toMatch(/^…deterministic/u)
    expect(results[0]?.snippet).not.toMatch(/\p{L}…$/u)
  })

  it("builds question context from the active AST before pages render", () => {
    const ast = buildSourceDocumentAst("a".repeat(64), [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [textItem("Introduction to clinical agents")],
      },
      {
        page: 2,
        width: 600,
        height: 800,
        items: [textItem("Retrospective memory retrieval preserves long context")],
      },
    ])
    setActiveDocumentAst(astDocumentId, ast)

    expect(paperContextForQuestion("memory retrieval", 1)).toContain(
      "Page 2: Retrospective memory retrieval",
    )
    expect(document.querySelector(".page")).toBeNull()
  })

  it("keeps native text while adding ready parsed blocks to question context", async () => {
    const ast = buildSourceDocumentAst("f".repeat(64), [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [textItem("Question Long-Term Memory Code Interface")],
      },
    ])
    const parsed = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: ast.sourceHash,
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 1,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:1:block:0",
          label: "text",
          order: 0,
          bounds: { x: 50, y: 50, width: 800, height: 160 },
          content: "Clinicians query electronic health records through an autonomous agent.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
      ],
    })
    Object.defineProperty(window, "scourgify", {
      configurable: true,
      value: { parseDocumentPage: async () => ({ status: "ready", page: parsed }) },
    })
    setActiveDocumentAst(astDocumentId, ast)
    await loadParsedDocumentPage(astDocumentId, 1)

    expect(paperContextForQuestion("autonomous agent", 1)).toContain(
      "Clinicians query electronic health records",
    )
    expect(paperContextForQuestion("Long-Term Memory", 1)).toContain("Long-Term Memory")
  })

  it("keeps focused table and definition evidence for a multipart question", () => {
    const filler = "Background evidence supports the surrounding method discussion. ".repeat(80)
    const ast = buildSourceDocumentAst("d".repeat(64), [
      {
        page: 8,
        width: 600,
        height: 800,
        items: [
          textItem(
            `${filler}Table 2 reports BLEU 28.4 and 41.8.${filler}5.4 Regularization. Label Smoothing uses epsilon_ls = 0.1 and improves BLEU.`,
          ),
        ],
      },
      {
        page: 9,
        width: 600,
        height: 800,
        items: [textItem(`${filler}Table 3: Variations on the Transformer architecture.`)],
      },
    ])
    setActiveDocumentAst(astDocumentId, ast)

    const context = paperContextForQuestion(
      "Transformer big의 영어-독일어와 영어-프랑스어 BLEU, 결과가 있는 표 번호, label smoothing 값과 의미를 각각 원문 근거와 함께 알려줘.",
      9,
    )

    expect(context).toContain("Table 2")
    expect(context).toContain("Table 3")
    expect(context).toContain("5.4 Regularization")
    expect(context).toContain("Label Smoothing")
  })

  it("sends a table's later rows with its caption instead of a short search preview", () => {
    const table =
      "Table 2: Translation BLEU results. " +
      "Baseline model: EN-DE 24.6, EN-FR 39.9. ".repeat(12) +
      "Transformer big: EN-DE 28.4, EN-FR 41.8."
    const ast = buildSourceDocumentAst("e".repeat(64), [
      { page: 1, width: 600, height: 800, items: [textItem(table)] },
    ])
    setActiveDocumentAst(astDocumentId, ast)

    const context = paperContextForQuestion("Table 2 translation BLEU", 1)

    expect(context).toContain("Table 2: Translation BLEU results.")
    expect(context).toContain("Transformer big: EN-DE 28.4, EN-FR 41.8.")
  })

  it("states the preceding section for a passage before the next heading", async () => {
    const ast = buildSourceDocumentAst("9".repeat(64), [
      { page: 7, width: 600, height: 800, items: [textItem("5.4 Regularization")] },
      {
        page: 8,
        width: 600,
        height: 800,
        items: [textItem("Label Smoothing uses epsilon_ls = 0.1. 6 Results")],
      },
    ])
    const pages = [
      parsedDocumentPageSchema.parse({
        schemaVersion: "1.0.0",
        sourceHash: ast.sourceHash,
        parser: "Mistral-OCR-4.1",
        configVersion: "blocks-v2",
        pageNumber: 7,
        width: 600,
        height: 800,
        blocks: [
          {
            id: "page:7:block:0",
            label: "paragraph_title",
            order: 0,
            bounds: { x: 50, y: 50, width: 300, height: 30 },
            content: "## 5.4 Regularization",
            contentFormat: "markdown",
            translationPolicy: "include",
          },
        ],
      }),
      parsedDocumentPageSchema.parse({
        schemaVersion: "1.0.0",
        sourceHash: ast.sourceHash,
        parser: "Mistral-OCR-4.1",
        configVersion: "blocks-v2",
        pageNumber: 8,
        width: 600,
        height: 800,
        blocks: [
          {
            id: "page:8:block:0",
            label: "text",
            order: 0,
            bounds: { x: 50, y: 50, width: 500, height: 60 },
            content: "Label Smoothing uses epsilon_ls = 0.1 and improves BLEU.",
            contentFormat: "text",
            translationPolicy: "include",
          },
          {
            id: "page:8:block:1",
            label: "paragraph_title",
            order: 1,
            bounds: { x: 50, y: 130, width: 300, height: 30 },
            content: "## 6 Results",
            contentFormat: "markdown",
            translationPolicy: "include",
          },
        ],
      }),
    ]
    Object.defineProperty(window, "scourgify", {
      configurable: true,
      value: {
        parseDocumentPage: async ({ pageNumber }: { readonly pageNumber: number }) => ({
          status: "ready",
          page: pages[pageNumber - 7],
        }),
      },
    })
    setActiveDocumentAst(astDocumentId, ast)
    await loadParsedDocumentPage(astDocumentId, 7)
    await loadParsedDocumentPage(astDocumentId, 8)

    const context = paperContextForQuestion("label smoothing epsilon_ls", 8)

    expect(context).toContain(
      'Verified section membership: page 8 passage belongs to "5.4 Regularization".',
    )
    expect(context).toContain('The following heading "6 Results" starts after that passage.')
  })

  it("loads the matching OCR page and its predecessor before building chat context", async () => {
    const ast = buildSourceDocumentAst("8".repeat(64), [
      { page: 1, width: 600, height: 800, items: [textItem("5.4 Regularization")] },
      {
        page: 2,
        width: 600,
        height: 800,
        items: [textItem("Label Smoothing uses epsilon_ls = 0.1. 6 Results")],
      },
    ])
    const parsedByPage = new Map([
      [
        1,
        parsedDocumentPageSchema.parse({
          schemaVersion: "1.0.0",
          sourceHash: ast.sourceHash,
          parser: "Mistral-OCR-4.1",
          configVersion: "blocks-v2",
          pageNumber: 1,
          width: 600,
          height: 800,
          blocks: [
            {
              id: "page:1:block:0",
              label: "paragraph_title",
              order: 0,
              bounds: { x: 50, y: 50, width: 300, height: 30 },
              content: "## 5.4 Regularization",
              contentFormat: "markdown",
              translationPolicy: "include",
            },
          ],
        }),
      ],
      [
        2,
        parsedDocumentPageSchema.parse({
          schemaVersion: "1.0.0",
          sourceHash: ast.sourceHash,
          parser: "Mistral-OCR-4.1",
          configVersion: "blocks-v2",
          pageNumber: 2,
          width: 600,
          height: 800,
          blocks: [
            {
              id: "page:2:block:0",
              label: "text",
              order: 0,
              bounds: { x: 50, y: 50, width: 500, height: 60 },
              content: "Label Smoothing uses epsilon_ls = 0.1.",
              contentFormat: "text",
              translationPolicy: "include",
            },
            {
              id: "page:2:block:1",
              label: "paragraph_title",
              order: 1,
              bounds: { x: 50, y: 130, width: 300, height: 30 },
              content: "## 6 Results",
              contentFormat: "markdown",
              translationPolicy: "include",
            },
          ],
        }),
      ],
    ])
    const parseDocumentPage = vi.fn(async ({ pageNumber }: { readonly pageNumber: number }) => ({
      status: "ready" as const,
      page: parsedByPage.get(pageNumber),
    }))
    Object.defineProperty(window, "scourgify", {
      configurable: true,
      value: {
        documentOcrStatus: async () => ({ configured: true }),
        parseDocumentPage,
      },
    })
    setActiveDocumentAst(astDocumentId, ast)

    const context = await preparePaperContextForQuestion(
      astDocumentId,
      "label smoothing epsilon_ls",
      2,
    )

    expect(parseDocumentPage).toHaveBeenCalledTimes(2)
    expect(context).toContain('belongs to "5.4 Regularization"')
    expect(context).toContain('following heading "6 Results" starts after')
  })
})
