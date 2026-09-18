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

    expect(paperContextForQuestion("memory retrieval", 1)).toMatch(
      /^Page 2: Retrospective memory retrieval/u,
    )
    expect(document.querySelector(".page")).toBeNull()
  })

  it("prefers ready Paddle paragraphs over noisy PDF text for question context", async () => {
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
    expect(paperContextForQuestion("autonomous agent", 1)).not.toContain("Long-Term Memory")
  })
})
