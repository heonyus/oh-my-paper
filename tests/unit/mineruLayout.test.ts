// @vitest-environment node

import { describe, expect, it } from "vitest"
import { mineruContentListToLayout } from "../../src/electron/mineruLayout"

describe("MinerU document layout", () => {
  it("maps ordered paragraphs, equations, and visual regions into the shared layout", () => {
    // Given
    const content = [
      {
        type: "text",
        text: "1 Introduction",
        text_level: 1,
        bbox: [80, 90, 920, 130],
        page_idx: 0,
      },
      {
        type: "text",
        text: "A complete paragraph reconstructed by MinerU.",
        bbox: [80, 150, 470, 260],
        page_idx: 0,
      },
      {
        type: "equation",
        text: "$$E = mc^2$$",
        text_format: "latex",
        bbox: [90, 300, 450, 360],
        page_idx: 0,
      },
      {
        type: "image",
        image_caption: ["Figure 1. Overview"],
        bbox: [520, 150, 920, 420],
        page_idx: 0,
      },
      {
        type: "table",
        table_caption: ["Table 1. Results"],
        bbox: [80, 500, 920, 760],
        page_idx: 0,
      },
    ]

    // When
    const layout = mineruContentListToLayout("a".repeat(64), content)

    // Then
    expect(layout).toMatchObject({
      version: 3,
      model: "MinerU2.5-Pro-2605-1.2B",
      pages: [{ pageNumber: 1, width: 1_000, height: 1_000 }],
    })
    expect(layout.pages[0]?.boxes).toEqual([
      expect.objectContaining({ label: "paragraph_title", order: 0, content: "1 Introduction" }),
      expect.objectContaining({
        label: "text",
        order: 1,
        content: "A complete paragraph reconstructed by MinerU.",
      }),
      expect.objectContaining({ label: "equation", order: 2, content: "$$E = mc^2$$" }),
      expect.objectContaining({ label: "image", order: 3 }),
      expect.objectContaining({ label: "table", order: 4 }),
    ])
  })

  it("rejects malformed MinerU coordinates at the process boundary", () => {
    // Given
    const malformed = [{ type: "text", text: "Broken", bbox: [100, 100, 90, 200], page_idx: 0 }]

    // When / Then
    expect(() => mineruContentListToLayout("b".repeat(64), malformed)).toThrow()
  })
})
