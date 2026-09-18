import { describe, expect, it } from "vitest"
import { resolvePageStructureBlocks } from "../../src/renderer/lib/pageStructureAi"
import type { LocalPageTranslationBlock } from "../../src/renderer/lib/pageTranslationLayout"

const local: readonly LocalPageTranslationBlock[] = [
  {
    id: "block:1-a",
    kind: "heading",
    source: "npj | digital medicine",
    sourceItemIds: ["item:1.0", "item:1.1"],
    structureKind: "title",
    bounds: { x: 10, y: 10, width: 180, height: 20 },
  },
  {
    id: "block:1-b",
    kind: "body",
    source: "Article",
    sourceItemIds: ["item:1.2"],
    structureKind: "metadata",
    bounds: { x: 10, y: 36, width: 60, height: 12 },
  },
]

describe("multimodal page structure correction", () => {
  it("merges local blocks while preserving every source item", () => {
    const blocks = resolvePageStructureBlocks(local, {
      blocks: [
        {
          id: "resolved:1.0",
          sourceBlockIds: ["block:1-a", "block:1-b"],
          kind: "title",
          order: 0,
          markdown: "## npj | 디지털 의학\n\n논문",
        },
      ],
    })

    expect(blocks[0]).toMatchObject({
      id: "resolved:1.0",
      source: "npj | digital medicine Article",
      sourceItemIds: ["item:1.0", "item:1.1", "item:1.2"],
      translation: "## npj | 디지털 의학\n\n논문",
    })
  })

  it("rejects output that omits a local block", () => {
    expect(() =>
      resolvePageStructureBlocks(local, {
        blocks: [
          {
            id: "resolved:1.0",
            sourceBlockIds: ["block:1-a"],
            kind: "title",
            order: 0,
            markdown: "## 제목",
          },
        ],
      }),
    ).toThrow()
  })
})
