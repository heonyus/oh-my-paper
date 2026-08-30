import { describe, expect, it } from "vitest"
import { systemPromptFor, userInputFor } from "../../src/electron/aiPrompts"
import { aiRequestSchema } from "../../src/shared/ipc"

const request = aiRequestSchema.parse({
  action: "figure",
  documentId: "aabbccddeeff0011",
  page: 2,
  quote: "Figure 1: Overview of leaderboard evaluation.",
  paperContext: "논문은 생의학 코딩 에이전트 훈련 환경을 제안한다.",
  sectionContext: "이 절은 모델 평가 결과와 일반화 성능을 설명한다.",
  before: "앞 문단은 평가 설정을 정의한다.",
  after: "다음 문단은 오류 분석을 논의한다.",
  featureKind: "figure",
  imageDataUrl: "data:image/png;base64,aG90ZWJvb2s=",
})

describe("research prompt contract", () => {
  it("separates paper, section, local, and target evidence slots", () => {
    const input = userInputFor(request)

    expect(input).toContain("<PAPER_CONTEXT>")
    expect(input).toContain("<CURRENT_SECTION>")
    expect(input).toContain("<LOCAL_BEFORE>")
    expect(input).toContain("<USER_QUESTION_OR_TARGET>")
    expect(input).toContain("<LOCAL_AFTER>")
  })

  it("asks figure analysis to lead with the scientific finding instead of crop disclaimers", () => {
    const prompt = systemPromptFor("figure")

    expect(prompt).toContain("Lead with the figure's main scientific finding")
    expect(prompt).toContain("Do not mention that the caption is truncated")
    expect(prompt).toContain("image as primary evidence")
  })
})
