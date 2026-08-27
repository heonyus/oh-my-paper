import { describe, expect, it } from "vitest"
import { upsertStructureCard } from "../../src/renderer/lib/structureCardState"
import type { DetectedStructure } from "../../src/renderer/lib/structureDetector"
import { boardCardSchema } from "../../src/shared/schemas"

const structure: DetectedStructure = {
  id: "figure-1",
  kind: "figure",
  page: 1,
  title: "Figure 1 해설",
  quote: "Comparison between EHR tasks",
  bounds: { x: 320, y: 180, width: 220, height: 160 },
}

function card(id: string, fragmentX: number) {
  return boardCardSchema.parse({
    id,
    documentId: "aabbccddeeff0011",
    kind: "infographic",
    title: structure.title,
    body: "loading",
    x: 900,
    y: 240,
    minimized: false,
    sourceKey: `1:figure:${structure.title}:${structure.quote}`,
    anchor: {
      page: 1,
      quote: structure.quote,
      x: fragmentX + 200,
      y: 260,
      fragments: [{ x: fragmentX, y: 180, width: 200, height: 160 }],
    },
  })
}

describe("structure card state", () => {
  it("keeps one card per structure and refreshes its source geometry", () => {
    const existing = card("f7ac31b5-19f6-4bec-b30a-3cf8692f9d82", 100)
    const fresh = card("88bdf14a-eace-4d70-80be-45ea55e8dd06", 320)

    const result = upsertStructureCard([existing], fresh, structure)

    expect(result.cards).toHaveLength(1)
    expect(result.card.id).toBe(existing.id)
    expect(result.card.x).toBe(existing.x)
    expect(result.card.anchor.fragments[0]?.x).toBe(320)
  })
})
