import { describe, expect, it } from "vitest"
import {
  normalizeParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../../src/shared/documentPageModel"

const hash = "a".repeat(64)

describe("parsed document page model", () => {
  it("accepts ordered Paddle blocks with page-local provenance", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: hash,
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 1,
      width: 1_200,
      height: 1_600,
      blocks: [
        {
          id: "page:1:block:0",
          label: "paragraph_title",
          order: 0,
          bounds: { x: 80, y: 100, width: 500, height: 60 },
          content: "1 Introduction",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:1:block:1",
          label: "image",
          order: 1,
          bounds: { x: 620, y: 100, width: 480, height: 300 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
      ],
    })

    expect(page.blocks.map((block) => block.order)).toEqual([0, 1])
  })

  it("rejects duplicate reading order and out-of-page bounds", () => {
    expect(() =>
      parsedDocumentPageSchema.parse({
        schemaVersion: "1.0.0",
        sourceHash: hash,
        parser: "PaddleOCR-VL-1.6",
        configVersion: "page-v1",
        pageNumber: 1,
        width: 600,
        height: 800,
        blocks: [
          {
            id: "page:1:block:0",
            label: "text",
            order: 0,
            bounds: { x: 40, y: 40, width: 100, height: 20 },
            content: "First",
            contentFormat: "markdown",
            translationPolicy: "include",
          },
          {
            id: "page:1:block:1",
            label: "text",
            order: 0,
            bounds: { x: 580, y: 40, width: 100, height: 20 },
            content: "Second",
            contentFormat: "markdown",
            translationPolicy: "include",
          },
        ],
      }),
    ).toThrow()
  })

  it("excludes text blocks nested inside visual regions", () => {
    const page = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: hash,
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
          bounds: { x: 500, y: 100, width: 400, height: 300 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:1",
          label: "text",
          order: 1,
          bounds: { x: 540, y: 140, width: 120, height: 40 },
          content: "Question Long-Term Memory",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
      ],
    })

    expect(normalizeParsedDocumentPage(page).blocks[1]?.translationPolicy).toBe("exclude")
  })
})
