import { describe, expect, it } from "vitest"
import { groundedAiRequest } from "../../src/renderer/lib/usePaperAiRequest"
import { documentRecordSchema } from "../../src/shared/schemas"

const documentFixture = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 12,
  title: "MedAgentGym",
  authors: ["Researcher"],
  year: 2026,
  doi: null,
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

describe("paper-grounded request", () => {
  it("injects request-specific context, cached summary, and local source overview", () => {
    const request = groundedAiRequest(
      documentFixture,
      "## 캐시된 요약\n- 실행 가능한 훈련 환경",
      "Abstract: 72,413 tasks across 12 scenarios.",
      {
        action: "figure",
        page: 2,
        quote: "Figure 1",
        before: "",
        after: "",
        paperContext: "현재 질문과 관련된 평가 문맥",
        sectionContext: "모델 성능 평가 절",
      },
    )

    expect(request.documentId).toBe(documentFixture.id)
    expect(request.paperContext).toContain("현재 질문과 관련된 평가 문맥")
    expect(request.paperContext).toContain("캐시된 논문 요약")
    expect(request.paperContext).toContain("로컬 원문 개요")
    expect(request.sectionContext).toBe("모델 성능 평가 절")
  })
})
