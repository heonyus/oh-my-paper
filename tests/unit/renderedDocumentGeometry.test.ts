import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { describe, expect, it } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import {
  mapLiveSelectionGeometry,
  mapRenderedDocumentGeometry,
  RenderedDocumentGeometrySession,
} from "../../src/renderer/lib/renderedDocumentGeometry"
import {
  composeSemanticDocumentAst,
  semanticDocumentAstSchema,
} from "../../src/renderer/lib/semanticDocumentAst"

function sourceFixture() {
  const item = (str: string, x: number, baseline: number, width: number): TextItem => ({
    str,
    dir: "ltr",
    transform: [10, 0, 0, 10, x, baseline],
    width,
    height: 10,
    fontName: "Helvetica",
    hasEOL: true,
  })
  return buildSourceDocumentAst("b".repeat(64), [
    {
      page: 1,
      width: 600,
      height: 800,
      items: [item("Alpha", 40, 740, 40), item("Beta", 40, 700, 32)],
    },
  ])
}

function rectangle(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height)
}

function pageElement(top: number, spanTop: number): HTMLElement {
  const page = document.createElement("div")
  page.setAttribute("data-page-number", "1")
  page.getBoundingClientRect = () => rectangle(100, top, 600, 800)
  const layer = document.createElement("div")
  layer.className = "textLayer"
  const span = document.createElement("span")
  span.setAttribute("data-ast-source-item-id", "item:1.0")
  span.textContent = "Alpha"
  span.getBoundingClientRect = () => rectangle(140, spanTop, 60, 15)
  layer.append(span)
  page.append(layer)
  const canvasWrapper = document.createElement("div")
  canvasWrapper.className = "canvasWrapper"
  const canvas = document.createElement("canvas")
  canvas.getBoundingClientRect = () => rectangle(100, top, 600, 800)
  canvasWrapper.append(canvas)
  page.append(canvasWrapper)
  return page
}

describe("rendered document geometry", () => {
  it("maps semantic IDs to page-local text and canvas geometry", () => {
    // Given
    const source = sourceFixture()
    const semantic = composeSemanticDocumentAst({ source }).ast
    const page = pageElement(200, 240)
    const semanticBefore = JSON.stringify(semantic)

    // When
    const geometry = mapRenderedDocumentGeometry({
      source,
      semantic,
      pageElements: [page],
      zoom: 1.5,
    })
    const node = semantic.nodes.find((candidate) => candidate.sourceItemIds.includes("item:1.0"))

    // Then
    expect(node).toBeDefined()
    if (!node) return
    const mapping = geometry.nodes.get(node.id)
    expect(mapping?.status).toBe("resolved")
    if (mapping?.status === "resolved") {
      expect(mapping.bounds[0]).toMatchObject({ x: 40, y: 40, width: 60, height: 15 })
      expect(mapping.pageId).toBe("page:1")
    }
    expect(geometry.pages[0]?.canvasBounds).toEqual({
      left: 100,
      top: 200,
      width: 600,
      height: 800,
    })
    expect(JSON.stringify(semantic)).toBe(semanticBefore)
  })

  it("refreshes after zoom and page DOM replacement while retaining semantic IDs", () => {
    // Given
    const source = sourceFixture()
    const semantic = composeSemanticDocumentAst({ source }).ast
    const session = new RenderedDocumentGeometrySession(source, semantic)
    const firstPage = pageElement(200, 240)
    const first = session.refresh([firstPage], 0.9)
    const firstNode = semantic.nodes.find((candidate) =>
      candidate.sourceItemIds.includes("item:1.0"),
    )
    if (!firstNode) throw new Error("semantic fixture must contain a paragraph node")
    expect(first.nodes.get(firstNode.id)?.status).toBe("resolved")

    // When
    const replacement = pageElement(100, 160)
    const second = session.refresh([replacement], 2)

    // Then
    expect(second.pages[0]?.pageElement).toBe(replacement)
    expect(second.pages[0]?.pageElement).not.toBe(first.pages[0]?.pageElement)
    expect(second.nodes.get(firstNode.id)?.status).toBe("resolved")
    expect(second.zoom).toBe(2)
    const midpoint = pageElement(150, 210)
    const third = session.refresh([midpoint], 1.5)
    expect(third.nodes.get(firstNode.id)?.status).toBe("resolved")
  })

  it("keeps missing nodes and live selections explicitly unresolved or page-local", () => {
    // Given
    const source = sourceFixture()
    const base = composeSemanticDocumentAst({ source }).ast
    const semantic = semanticDocumentAstSchema.parse({
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: "node:ocr-unresolved",
          kind: "ocr_block",
          pageId: "page:1",
          sourceItemIds: [],
          bounds: { x: 40, y: 100, width: 80, height: 30 },
          text: "",
          confidence: 0.4,
          origin: "local_ocr",
          reasons: ["no text-layer provenance"],
        },
      ],
    })
    const page = pageElement(200, 240)
    const node = semantic.nodes.find((candidate) => candidate.id === "node:ocr-unresolved")
    if (!node) throw new Error("semantic fixture must contain unresolved node")
    const range = {
      getClientRects: () => [rectangle(140, 240, 60, 15), rectangle(500, 260, 60, 15)],
    }

    // When
    const geometry = mapRenderedDocumentGeometry({
      source,
      semantic,
      pageElements: [page],
      zoom: 1.5,
    })
    const selection = mapLiveSelectionGeometry({
      nodeId: node.id,
      pageElement: page,
      range,
      pageSize: { width: 600, height: 800 },
    })

    // Then
    expect(geometry.nodes.get(node.id)?.status).toBe("unresolved")
    expect(selection.status).toBe("resolved")
    if (selection.status === "resolved")
      expect(selection.bounds).toEqual([
        { x: 40, y: 40, width: 60, height: 15 },
        { x: 400, y: 60, width: 60, height: 15 },
      ])
  })
})
