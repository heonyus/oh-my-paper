import { describe, expect, it } from "vitest"
import {
  citationAssessmentInput,
  citationAssessmentScore,
  parseCitationAssessment,
  rankCitationAssessments,
} from "../../src/renderer/lib/citationTriage"
import type { CitationAiAssessment } from "../../src/shared/citationAssessment"

function assessment(score: number, confidence = 0.9): CitationAiAssessment {
  const dependency = Math.min(30, score)
  const methodological = Math.min(25, Math.max(0, score - dependency))
  const conceptual = Math.min(20, Math.max(0, score - dependency - methodological))
  const evidentiary = Math.min(15, Math.max(0, score - dependency - methodological - conceptual))
  const contextSufficiency = Math.min(
    10,
    Math.max(0, score - dependency - methodological - conceptual - evidentiary),
  )
  return {
    breakdown: { dependency, methodological, conceptual, evidentiary, contextSufficiency },
    confidence,
    citationReason: "현재 논문의 방법 선택 근거로 인용됩니다.",
    readingValue: "방법 절을 확인할 가치가 있습니다.",
    reasons: ["직접적인 방법 의존성이 있습니다."],
    recommendedSections: ["method"],
    limitations: [],
  }
}

describe("citation triage", () => {
  it("parses only the bounded JSON assessment contract", () => {
    const parsed = parseCitationAssessment(`\`\`\`json\n${JSON.stringify(assessment(82))}\n\`\`\``)
    expect(citationAssessmentScore(parsed)).toBe(82)
    expect(() => parseCitationAssessment('{"tier":"deep_read"}')).toThrow()
  })

  it("keeps deep reading rare and pass as the majority", () => {
    const ranked = rankCitationAssessments(
      Array.from({ length: 100 }, (_, index) => ({
        id: `paper-${index}`,
        assessment: assessment(100 - Math.floor(index / 2)),
      })),
    )
    const count = (tier: string) => ranked.filter((item) => item.tier === tier).length

    expect(count("deep_read")).toBeLessThanOrEqual(5)
    expect(count("skim")).toBeLessThanOrEqual(15)
    expect(count("abstract_only")).toBeLessThanOrEqual(25)
    expect(count("pass")).toBeGreaterThan(50)
  })

  it("requires an exceptional score for deep reading in a small set", () => {
    expect(rankCitationAssessments([{ id: "a", assessment: assessment(95) }])[0]?.tier).toBe("skim")
    expect(rankCitationAssessments([{ id: "a", assessment: assessment(96) }])[0]?.tier).toBe(
      "deep_read",
    )
  })

  it("grounds assessment input in verified identity and citation context", () => {
    const input = citationAssessmentInput(
      "Current Paper",
      {
        key: "12",
        title: "Cited Paper",
        authors: "Jane Doe",
        year: 2024,
        venue: "KDD",
        rawText: "[12] Jane Doe. Cited Paper.",
        doi: null,
        contexts: [{ page: 3, text: "We adopt the method from [12]." }],
      },
      {
        paperId: "paper-12",
        title: "Cited Paper",
        authors: ["Jane Doe"],
        year: 2024,
        venue: "KDD",
        abstract: "A verified abstract.",
        doi: null,
        url: null,
        openAccessUrl: null,
        citationCount: 10,
      },
      { score: 0.94, signals: ["title similarity 100%"], candidatesCompared: 3 },
    )

    expect(input).toContain("IDENTITY CONFIDENCE: 94%")
    expect(input).toContain("We adopt the method from [12]")
  })
})
