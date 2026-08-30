import { describe, expect, it } from "vitest"
import { conciseCardTitle, parsedCardResponse } from "../../src/renderer/lib/cardPresentation"

describe("card presentation", () => {
  it("parses a concise heading and preserves structured Markdown body", () => {
    expect(parsedCardResponse("# 통합 벤치마크\n\n## 핵심\n\n- 근거", "섹션 해설")).toEqual({
      title: "통합 벤치마크",
      body: "## 핵심\n\n- 근거",
    })
  })

  it("removes generic title suffixes and bounds long titles", () => {
    expect(conciseCardTitle("Figure 1 해설", "그림")).toBe("Figure 1")
    expect(conciseCardTitle("가".repeat(60), "카드")).toHaveLength(42)
  })
})
