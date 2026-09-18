import { describe, expect, it } from "vitest"
import {
  bindPageSourceBounds,
  setPageSourceActive,
} from "../../src/renderer/lib/pageTranslationSource"
import {
  pageTranslationBlocksFromParsedPage,
  parsedPageBodyText,
  planParsedPageTranslations,
} from "../../src/renderer/lib/parsedPageTranslation"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"

describe("Paddle page translation blocks", () => {
  it("preserves order and LaTeX while excluding visual and furniture blocks", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "b".repeat(64),
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
          bounds: { x: 50, y: 80, width: 400, height: 100 },
          content: "A coherent first sentence. A connected second sentence.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:1:block:1",
          label: "image",
          order: 1,
          bounds: { x: 520, y: 80, width: 420, height: 300 },
          content: "Question Long-Term Memory Code Interface",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:2",
          label: "equation",
          order: 2,
          bounds: { x: 80, y: 420, width: 500, height: 80 },
          content: "$$E = mc^2$$",
          contentFormat: "latex",
          translationPolicy: "include",
        },
        {
          id: "page:1:block:3",
          label: "footer",
          order: 3,
          bounds: { x: 80, y: 940, width: 500, height: 30 },
          content: "1",
          contentFormat: "text",
          translationPolicy: "exclude",
        },
      ],
    })

    const blocks = pageTranslationBlocksFromParsedPage(page)

    expect(blocks.map((block) => block.source)).toEqual([
      "A coherent first sentence.",
      "A connected second sentence.",
      "$$E = mc^2$$",
    ])
    expect(blocks.map((block) => block.id)).toEqual([
      "page:1:block:0:sentence:1",
      "page:1:block:0:sentence:2",
      "page:1:block:2",
    ])
    expect(blocks.map((block) => block.parsedBlockId)).toEqual([
      "page:1:block:0",
      "page:1:block:0",
      "page:1:block:2",
    ])
    expect(parsedPageBodyText(page)).toBe(
      "A coherent first sentence.\n\nA connected second sentence.\n\n$$E = mc^2$$",
    )
  })

  it("binds parsed block bounds as the primary hover provenance", () => {
    const host = document.createElement("div")
    host.className = "paper-structure-host"
    const page = document.createElement("div")
    page.setAttribute("data-page-number", "1")
    host.append(page)
    document.body.append(host)

    bindPageSourceBounds(1, [
      {
        id: "page:1:block:0",
        kind: "body",
        source: "Paragraph",
        parsedBlockId: "page:1:block:0",
        sourceBounds: { x: 100, y: 200, width: 300, height: 120 },
        sourcePageWidth: 1_000,
        sourcePageHeight: 1_000,
      },
    ])
    setPageSourceActive(1, "page:1:block:0", true)

    const bound = page.querySelector<HTMLElement>('[data-page-translation-block="page:1:block:0"]')
    expect(bound).toHaveClass("page-translation-source-bound")
    expect(bound).toHaveAttribute("data-page-translation-active", "true")
    expect(bound?.style.left).toBe("10%")
    document.body.replaceChildren()
  })

  it("keeps a numbered list marker attached to its sentence", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "c".repeat(64),
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 3,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:3:block:7",
          label: "text",
          order: 0,
          bounds: { x: 50, y: 80, width: 500, height: 120 },
          content: "1. A skill-spanning scenario suite. It covers patient cases.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
      ],
    })

    expect(pageTranslationBlocksFromParsedPage(page).map((block) => block.source)).toEqual([
      "1. A skill-spanning scenario suite.",
      "It covers patient cases.",
    ])
  })

  it("seeds display equations unchanged instead of requiring an AI translation", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "d".repeat(64),
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 4,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:4:block:1",
          label: "text",
          order: 0,
          bounds: { x: 50, y: 80, width: 500, height: 100 },
          content: "We define the update.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:4:block:2",
          label: "equation",
          order: 1,
          bounds: { x: 80, y: 220, width: 500, height: 80 },
          content: "$$S_j = \\mathcal{M}(H_j)$$",
          contentFormat: "latex",
          translationPolicy: "include",
        },
      ],
    })

    const plan = planParsedPageTranslations(pageTranslationBlocksFromParsedPage(page))

    expect(plan.translatable.map((block) => block.id)).toEqual(["page:4:block:1:sentence:1"])
    expect(plan.initial.map((block) => block.translation)).toEqual([
      "",
      "$$S_j = \\mathcal{M}(H_j)$$",
    ])
    expect([...plan.completed]).toEqual([["page:4:block:2", "$$S_j = \\mathcal{M}(H_j)$$"]])
  })
})
