import { describe, expect, it } from "vitest"
import { mergePageTranslations } from "../../src/renderer/lib/pageTranslationPaneState"
import type { PageTranslationBlock } from "../../src/renderer/lib/pageTranslationSource"

const blocks: readonly PageTranslationBlock[] = [
  { id: "p1-b1", kind: "heading", source: "Results", translation: "" },
  { id: "p1-b2", kind: "body", source: "The score improved.", translation: "" },
]

describe("mergePageTranslations", () => {
  it("returns the same array and block objects when no translation changed", () => {
    const seeded = mergePageTranslations(blocks, new Map([["p1-b1", "결과"]]))
    const merged = mergePageTranslations(seeded, new Map([["p1-b1", "결과"]]))

    expect(merged).toBe(seeded)
    expect(merged[0]).toBe(seeded[0])
    expect(merged[1]).toBe(seeded[1])
  })

  it("keeps references for untouched blocks while replacing the changed one", () => {
    const merged = mergePageTranslations(blocks, new Map([["p1-b2", "점수가 향상됐다."]]))

    expect(merged).not.toBe(blocks)
    expect(merged[0]).toBe(blocks[0])
    expect(merged[1]).not.toBe(blocks[1])
    expect(merged[1]?.translation).toBe("점수가 향상됐다.")
  })
})
