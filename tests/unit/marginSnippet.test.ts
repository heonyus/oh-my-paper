import { describe, expect, it } from "vitest"
import { marginSnippet } from "../../src/renderer/lib/marginSnippet"

describe("marginSnippet", () => {
  it("reads citation links as their numbers, even when a link target holds parentheses", () => {
    expect(
      marginSnippet(
        "Extended Neural GPU([16](https://scholar.google.com/scholar?q=Can%20active%20memory), [18](https://doi.org/10.1016/S0(00)1))의 기반이 된다.",
      ),
    ).toBe("Extended Neural GPU(16, 18)의 기반이 된다.")
  })

  it("never cuts inside inline math", () => {
    const text = `${"가".repeat(210)} 은닉 상태 $h_{t-1}$과 위치 $t$의 입력으로 $h_t$를 만든다.`
    const snippet = marginSnippet(text)

    expect(snippet.endsWith("…")).toBe(true)
    expect((snippet.match(/\$/gu) ?? []).length % 2).toBe(0)
    expect(snippet).not.toContain("h_{t-")
  })

  it("keeps short text whole", () => {
    expect(marginSnippet("위치 $t$의 입력")).toBe("위치 $t$의 입력")
  })
})
