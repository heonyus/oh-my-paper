import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { afterEach, describe, expect, it } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import {
  activeDocumentAst,
  bindAstItemsToRenderedPage,
  clearActiveDocumentAst,
  pageSourceBlocksForDocument,
  setActiveDocumentAst,
} from "../../src/renderer/lib/documentAstRuntime"
import { documentIdSchema } from "../../src/shared/schemas"

const documentId = documentIdSchema.parse("aabbccddeeff0011")

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

describe("active document AST runtime", () => {
  afterEach(() => {
    clearActiveDocumentAst(documentId)
    document.body.replaceChildren()
  })

  it("maps AST page blocks onto rendered source spans without reparsing the page", () => {
    const ast = buildSourceDocumentAst("a".repeat(64), [
      { page: 1, width: 600, height: 800, items: [textItem("Memory retrieval works.")] },
    ])
    const page = document.createElement("div")
    page.className = "page"
    page.setAttribute("data-page-number", "1")
    const layer = document.createElement("div")
    layer.className = "textLayer"
    const span = document.createElement("span")
    span.textContent = "Memory retrieval works."
    layer.append(span)
    page.append(layer)
    document.body.append(page)

    setActiveDocumentAst(documentId, ast)
    bindAstItemsToRenderedPage(documentId, 1)
    const blocks = pageSourceBlocksForDocument(documentId, 1)

    expect(activeDocumentAst(documentId)).toBe(ast)
    expect(blocks?.map((block) => block.source)).toEqual(["Memory retrieval works."])
    expect(span).toHaveAttribute("data-ast-source-item-id", "item:1.0")
    expect(span).toHaveAttribute("data-page-translation-block", "block:1-1-item-1.0")
  })
})
