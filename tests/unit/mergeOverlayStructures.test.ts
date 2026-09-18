import { describe, expect, it } from "vitest"
import { mergeOverlayStructures } from "../../src/renderer/lib/pdfOverlayAnalysis"
import type { DetectedStructure } from "../../src/renderer/lib/structureDetector"

const structure = (
  kind: DetectedStructure["kind"],
  bounds: { x: number; y: number; width: number; height: number },
  title = kind,
): DetectedStructure => ({
  id: `${kind}-${bounds.x}-${bounds.y}`,
  kind,
  page: 1,
  title,
  quote: title,
  bounds,
})

describe("mergeOverlayStructures", () => {
  it("keeps detected structures the parsed model cannot produce", () => {
    const parsed = [structure("section", { x: 10, y: 10, width: 200, height: 30 })]
    const detected = [
      structure("section", { x: 12, y: 12, width: 180, height: 24 }),
      structure("citation", { x: 50, y: 200, width: 40, height: 12 }),
      structure("equation", { x: 60, y: 400, width: 120, height: 20 }),
    ]
    const merged = mergeOverlayStructures(parsed, detected)
    expect(merged).toHaveLength(3)
    expect(merged.map((item) => item.kind).sort()).toEqual(["citation", "equation", "section"])
  })

  it("does not duplicate a detected structure overlapping the parsed one", () => {
    const parsed = [structure("table", { x: 0, y: 0, width: 300, height: 150 })]
    const detected = [structure("table", { x: 20, y: 30, width: 200, height: 100 })]
    expect(mergeOverlayStructures(parsed, detected)).toHaveLength(1)
  })

  it("keeps detected structures of the same kind when they do not overlap", () => {
    const parsed = [structure("figure", { x: 0, y: 0, width: 200, height: 100 })]
    const detected = [structure("figure", { x: 0, y: 400, width: 200, height: 100 })]
    expect(mergeOverlayStructures(parsed, detected)).toHaveLength(2)
  })

  it("sorts merged structures by position", () => {
    const parsed = [structure("section", { x: 10, y: 500, width: 200, height: 30 })]
    const detected = [structure("citation", { x: 10, y: 100, width: 40, height: 12 })]
    const merged = mergeOverlayStructures(parsed, detected)
    expect(merged[0]?.kind).toBe("citation")
    expect(merged[1]?.kind).toBe("section")
  })
})
