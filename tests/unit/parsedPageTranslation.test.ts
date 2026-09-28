import { describe, expect, it } from "vitest"
import {
  bindPageSourceBounds,
  setPageSourceActive,
} from "../../src/renderer/lib/pageTranslationSource"
import {
  pageTranslationBlocksFromParsedPage,
  parsedPageBodyText,
  planParsedPageTranslations,
  sentenceBreaks,
  sentencesOf,
} from "../../src/renderer/lib/parsedPageTranslation"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"

describe("Paddle page translation blocks", () => {
  it("joins adjacent native text lines before splitting them into sentences", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "a".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v2",
      pageNumber: 1,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:1:block:0",
          label: "text",
          order: 0,
          bounds: { x: 80, y: 100, width: 700, height: 18 },
          content: "The model predicts circulatory failure",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:1:block:1",
          label: "text",
          order: 1,
          bounds: { x: 82, y: 121, width: 680, height: 18 },
          content: "within the next eight hours.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
      ],
    })

    expect(pageTranslationBlocksFromParsedPage(page).map((block) => block.source)).toEqual([
      "The model predicts circulatory failure within the next eight hours.",
    ])
  })

  it("preserves order, visual anchors and LaTeX while excluding furniture blocks", () => {
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
      "Question Long-Term Memory Code Interface",
      "$$E = mc^2$$",
    ])
    expect(blocks.map((block) => block.id)).toEqual([
      "page:1:block:0:sentence:1",
      "page:1:block:0:sentence:2",
      "page:1:block:1",
      "page:1:block:2",
    ])
    expect(blocks.map((block) => block.parsedBlockId)).toEqual([
      "page:1:block:0",
      "page:1:block:0",
      "page:1:block:1",
      "page:1:block:2",
    ])
    expect(parsedPageBodyText(page)).toBe(
      "A coherent first sentence.\n\nA connected second sentence.\n\nQuestion Long-Term Memory Code Interface\n\n$$E = mc^2$$",
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

  it("wraps an un-delimited LaTeX equation for the Markdown math renderer", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "e".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v2",
      pageNumber: 5,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:5:block:1",
          label: "equation",
          order: 0,
          bounds: { x: 80, y: 220, width: 500, height: 80 },
          content: "E = mc^2",
          contentFormat: "latex",
          translationPolicy: "include",
        },
      ],
    })

    expect(pageTranslationBlocksFromParsedPage(page)[0]?.source).toBe("$$\nE = mc^2\n$$")
  })

  it("keeps an image block with no OCR text as a source figure anchor", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "f".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "blocks-v2",
      pageNumber: 6,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:6:block:1",
          label: "image",
          order: 0,
          bounds: { x: 80, y: 220, width: 500, height: 280 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
      ],
    })

    const blocks = pageTranslationBlocksFromParsedPage(page)
    const plan = planParsedPageTranslations(blocks)
    expect(blocks[0]?.source).toBe("원본 그림")
    expect(blocks[0]?.structureKind).toBe("figure")
    expect(plan.initial[0]?.translation).toBe("원본 그림")
    expect(plan.translatable).toHaveLength(0)
  })

  it("drops single-letter labels that belong inside a figure image", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "a".repeat(64),
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 7,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:7:block:0",
          label: "image",
          order: 0,
          bounds: { x: 100, y: 100, width: 800, height: 600 },
          content: "",
          contentFormat: "none",
          translationPolicy: "include",
        },
        {
          id: "page:7:block:1",
          label: "text",
          order: 1,
          bounds: { x: 160, y: 180, width: 12, height: 12 },
          content: "a",
          contentFormat: "text",
          translationPolicy: "include",
        },
      ],
    })

    expect(pageTranslationBlocksFromParsedPage(page)).toHaveLength(1)
    expect(pageTranslationBlocksFromParsedPage(page)[0]?.structureKind).toBe("figure")
  })

  it("keeps abbreviations and initials inside their sentence", () => {
    expect(
      sentencesOf(
        "Fig. 2 | Model performance. S.L.H., M. Hüser and X.L. designed it, as in Smith et al. 2019. The panel ends at a.",
      ),
    ).toEqual([
      "Fig. 2 | Model performance.",
      "S.L.H., M. Hüser and X.L. designed it, as in Smith et al. 2019.",
      "The panel ends at a.",
    ])
  })

  it("finds sentence ends even before a lower-case panel letter", () => {
    const caption = "Fig. 2 | Model performance. a, Receiver curves. b, Precision."
    expect(sentenceBreaks(caption).map((end) => caption.slice(0, end))).toEqual([
      "Fig. 2 | Model performance.",
      "Fig. 2 | Model performance. a, Receiver curves.",
      "Fig. 2 | Model performance. a, Receiver curves. b, Precision.",
    ])
  })

  it("cuts translation units at the layout model's paragraphs", () => {
    const text = (index: number, y: number, content: string, height = 14) => ({
      id: `page:1:block:${index}`,
      label: "text",
      order: index,
      bounds: { x: 80, y, width: 400, height },
      content,
      contentFormat: "markdown",
      translationPolicy: "include",
    })
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "a".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "hybrid-v11",
      pageNumber: 1,
      width: 1_000,
      height: 1_400,
      blocks: [
        // An author line has no full stop, so it would run into the abstract's first sentence.
        text(0, 100, "Stephanie L. Hyland 1,2, Martin Faltys 5 and Tobias M. Merz 9"),
        text(1, 140, "Clinicians see many measurements. Alarms tire them."),
        // PDF.js ran the end of one list item and the next item into one unit.
        text(2, 200, "that ends here. • Record duplication. Records repeat.", 32),
      ],
      layout: [
        { label: "text", order: 0, bounds: { x: 75, y: 95, width: 420, height: 24 }, content: "" },
        { label: "text", order: 1, bounds: { x: 75, y: 135, width: 420, height: 24 }, content: "" },
        { label: "list", order: 2, bounds: { x: 75, y: 190, width: 420, height: 20 }, content: "" },
        { label: "list", order: 3, bounds: { x: 75, y: 214, width: 420, height: 20 }, content: "" },
      ],
    })

    const units = pageTranslationBlocksFromParsedPage(page)

    expect(units.map((unit) => [unit.parsedBlockId, unit.source])).toEqual([
      ["page:1:block:0", "Stephanie L. Hyland 1,2, Martin Faltys 5 and Tobias M. Merz 9"],
      ["page:1:block:1", "Clinicians see many measurements."],
      ["page:1:block:1", "Alarms tire them."],
      ["page:1:block:2", "that ends here."],
      ["page:1:block:2.1", "• Record duplication."],
      ["page:1:block:2.1", "Records repeat."],
    ])
  })

  it("keeps a sentence that breaks across columns in one translation unit", () => {
    const text = (index: number, x: number, y: number, content: string) => ({
      id: `page:1:block:${index}`,
      label: "text",
      order: index,
      bounds: { x, y, width: 400, height: 14 },
      content,
      contentFormat: "markdown",
      translationPolicy: "include",
    })
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "a".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "hybrid-v11",
      pageNumber: 1,
      width: 1_000,
      height: 1_400,
      blocks: [
        text(
          0,
          80,
          1_300,
          "The system recorded many variants (for example, different dilutions of",
        ),
        text(1, 540, 100, "vasopressors, different probe locations). Some were rare."),
        text(2, 540, 140, "Certain compounds were grouped."),
      ],
      layout: [
        {
          label: "text",
          order: 0,
          bounds: { x: 75, y: 1_295, width: 420, height: 24 },
          content: "",
        },
        { label: "text", order: 1, bounds: { x: 535, y: 95, width: 420, height: 24 }, content: "" },
        {
          label: "text",
          order: 2,
          bounds: { x: 535, y: 135, width: 420, height: 24 },
          content: "",
        },
      ],
    })

    expect(pageTranslationBlocksFromParsedPage(page).map((unit) => unit.source)).toEqual([
      "The system recorded many variants (for example, different dilutions of vasopressors, different probe locations).",
      "Some were rare.",
      "Certain compounds were grouped.",
    ])
  })

  it("cuts a unit PDF.js ran across paragraphs where each paragraph opens, and drops sideways text", () => {
    const text = (index: number, bounds: object, content: string) => ({
      id: `page:1:block:${index}`,
      label: "text",
      order: index,
      bounds,
      content,
      contentFormat: "markdown",
      translationPolicy: "include",
    })
    const layout = (order: number, y: number, height: number, content: string) => ({
      label: "text",
      order,
      bounds: { x: 170, y, width: 700, height },
      content,
    })
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: "a".repeat(64),
      parser: "PDF.js+PaddleOCR-VL-1.6",
      configVersion: "hybrid-v12",
      pageNumber: 1,
      width: 1_224,
      height: 1_584,
      blocks: [
        // Four affiliations, each opening with a raised number, read as one unit.
        text(
          0,
          { x: 178, y: 326, width: 435, height: 85 },
          "1 Peking University 2 The University of Hong Kong 3 The Hong Kong University of Science and Technology 4 Shanghai Artificial Intelligence Laboratory",
        ),
        text(1, { x: 179, y: 651, width: 866, height: 20 }, "We study agents."),
        text(2, { x: 179, y: 675, width: 866, height: 20 }, "They learn plans."),
        text(3, { x: 179, y: 699, width: 866, height: 20 }, "Our work offers a new paradigm."),
        // The abstract's last line and the keywords line after it.
        text(
          4,
          { x: 179, y: 723, width: 762, height: 49 },
          "It is effective. Keywords: large language model agent, self-evolving",
        ),
        // The arXiv stamp, set sideways, whose box PDF.js spread over the page.
        text(
          5,
          { x: 24, y: 438, width: 1_019, height: 1_036 },
          "arXiv:2508.02621v2 [cs.AI] 11 Oct 2025",
        ),
      ],
      layout: [
        layout(0, 327, 22, "$ ^{1} $ Peking University"),
        layout(1, 350, 21, "$ ^{2} $The University of Hong Kong"),
        layout(2, 371, 25, "$ ^{3} $The Hong Kong University of Science and Technology"),
        layout(3, 395, 22, "$ ^{4} $Shanghai Artificial Intelligence Laboratory"),
        layout(4, 438, 312, "Abstract: The rapid proliferation of scientific knowledge"),
        layout(5, 754, 24, "Keywords: large language model agent, self-evolving"),
      ],
    })

    expect(pageTranslationBlocksFromParsedPage(page).map((unit) => unit.source)).toEqual([
      "1 Peking University",
      "2 The University of Hong Kong",
      "3 The Hong Kong University of Science and Technology",
      "4 Shanghai Artificial Intelligence Laboratory",
      "We study agents.",
      "They learn plans.",
      "Our work offers a new paradigm.",
      "It is effective.",
      "Keywords: large language model agent, self-evolving",
    ])
  })
})
