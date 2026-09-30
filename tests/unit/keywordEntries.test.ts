import { describe, expect, it } from "vitest"
import { keywordEntries } from "../../src/renderer/lib/keywordEntries"

describe("keywordEntries", () => {
  it("reads term bullets in the forms models write them", () => {
    expect(
      keywordEntries(
        [
          "- **Chain-of-Thought**: 중간 추론 단계를 적게 하는 프롬프팅 방식.",
          "* **GSM8K:** 초등 수학 문장제 벤치마크.",
          "2. **Self-consistency** — 여러 추론 경로의 다수결.",
        ].join("\n"),
      ),
    ).toEqual([
      { term: "Chain-of-Thought", definition: "중간 추론 단계를 적게 하는 프롬프팅 방식." },
      { term: "GSM8K", definition: "초등 수학 문장제 벤치마크." },
      { term: "Self-consistency", definition: "여러 추론 경로의 다수결." },
    ])
  })

  it("leaves out headings, prose, and a bullet still streaming in", () => {
    expect(
      keywordEntries(
        [
          "# 핵심 개념",
          "5가지 핵심 용어를 정리했습니다.",
          "",
          "- **circEWS**: 순환부전 조기 경보 시스템.",
          "- **문제** 정의가 없는 줄",
          "- **AUPR",
        ].join("\n"),
      ),
    ).toEqual([{ term: "circEWS", definition: "순환부전 조기 경보 시스템." }])
  })
})
