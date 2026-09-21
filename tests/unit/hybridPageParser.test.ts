import { describe, expect, it } from "vitest"
import { mergePdfJsAndPaddlePage } from "../../src/electron/hybridPageParser"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"

const sourceHash = "a".repeat(64)

describe("hybridPageParser", () => {
  it("keeps PDF.js text while replacing structural regions with Paddle blocks", () => {
    const native = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash,
      parser: "NativeText-1.0",
      configVersion: "page-native-v1",
      pageNumber: 1,
      width: 600,
      height: 800,
      blocks: [
        {
          id: "page:1:block:0",
          label: "text",
          order: 0,
          bounds: { x: 170, y: 75, width: 120, height: 20 },
          content: "Softmax Linear Feed Forward",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:1:block:1",
          label: "figure_title",
          order: 1,
          bounds: { x: 100, y: 250, width: 400, height: 20 },
          content: "Figure 1: Native caption text.",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:2",
          label: "text",
          order: 2,
          bounds: { x: 100, y: 300, width: 400, height: 40 },
          content: "PDF.js body keeps d_k exactly.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:1:block:3",
          label: "text",
          order: 3,
          bounds: { x: 180, y: 400, width: 240, height: 30 },
          content: "Attention Q K V embedded PDF text",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:1:block:4",
          label: "text",
          order: 4,
          bounds: { x: 100, y: 460, width: 400, height: 50 },
          content: "Following paragraph.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
      ],
    })
    const paddle = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash,
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v2",
      pageNumber: 1,
      width: 1_200,
      height: 1_600,
      blocks: [
        {
          id: "page:1:block:0",
          label: "image",
          order: 8,
          bounds: { x: 300, y: 100, width: 400, height: 320 },
          content: '<img src="figure.png" />',
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:1",
          label: "figure_title",
          order: 9,
          bounds: { x: 200, y: 490, width: 800, height: 40 },
          content: "Figure OCR caption with an error.",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:2",
          label: "equation",
          order: 3,
          bounds: { x: 350, y: 790, width: 380, height: 70 },
          content: "$$Attention(Q,K,V)=softmax(QK^T/\\sqrt{d_k})V$$",
          contentFormat: "latex",
          translationPolicy: "include",
        },
        {
          id: "page:1:block:3",
          label: "unknown",
          order: 4,
          bounds: { x: 980, y: 800, width: 30, height: 28 },
          content: "(1)",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:4",
          label: "text",
          order: 5,
          bounds: { x: 200, y: 900, width: 800, height: 80 },
          content: "OCR body changed d_k to d_x.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
      ],
    })

    const merged = mergePdfJsAndPaddlePage(native, paddle)

    expect(merged.parser).toBe("PDF.js+PaddleOCR-VL-1.6")
    expect(merged.width).toBe(1_200)
    expect(merged.height).toBe(1_600)
    expect(merged.blocks.map((block) => block.label)).toEqual([
      "image",
      "figure_title",
      "text",
      "equation",
      "text",
    ])
    expect(merged.blocks.map((block) => block.content)).toEqual([
      '<img src="figure.png" />',
      "Figure 1: Native caption text.",
      "PDF.js body keeps d_k exactly.",
      "$$Attention(Q,K,V)=softmax(QK^T/\\sqrt{d_k})V$$ (1)",
      "Following paragraph.",
    ])
    expect(merged.blocks[3]?.bounds).toEqual({ x: 350, y: 790, width: 660, height: 70 })
    expect(merged.blocks.every((block, index) => block.order === index)).toBe(true)
  })

  it("keeps native column order while inserting a detected table after its caption", () => {
    const native = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash,
      parser: "NativeText-1.0",
      configVersion: "page-native-v1",
      pageNumber: 2,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:2:block:0",
          label: "table_title",
          order: 0,
          bounds: { x: 100, y: 100, width: 800, height: 30 },
          content: "Table 2: Exact native caption.",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
        {
          id: "page:2:block:1",
          label: "text",
          order: 1,
          bounds: { x: 100, y: 150, width: 800, height: 200 },
          content: "Flattened table text",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:2:block:2",
          label: "text",
          order: 2,
          bounds: { x: 100, y: 400, width: 350, height: 80 },
          content: "Left column follows.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
        {
          id: "page:2:block:3",
          label: "text",
          order: 3,
          bounds: { x: 550, y: 400, width: 350, height: 80 },
          content: "Right column follows.",
          contentFormat: "markdown",
          translationPolicy: "include",
        },
      ],
    })
    const paddle = parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash,
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v2",
      pageNumber: 2,
      width: 1_000,
      height: 1_000,
      blocks: [
        {
          id: "page:2:block:0",
          label: "table",
          order: 7,
          bounds: { x: 100, y: 145, width: 800, height: 210 },
          content: "<table><tr><td>39.92</td></tr></table>",
          contentFormat: "html",
          translationPolicy: "exclude",
        },
      ],
    })

    const merged = mergePdfJsAndPaddlePage(native, paddle)

    expect(merged.blocks.map((block) => block.content)).toEqual([
      "Table 2: Exact native caption.",
      "<table><tr><td>39.92</td></tr></table>",
      "Left column follows.",
      "Right column follows.",
    ])
  })
})
