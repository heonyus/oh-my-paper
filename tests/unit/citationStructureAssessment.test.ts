import { describe, expect, it, vi } from "vitest"
import { assessCitationStructure } from "../../src/renderer/lib/citationStructureAssessment"
import type { DetectedStructure } from "../../src/renderer/lib/structureDetector"
import type { AiRequest } from "../../src/shared/ipc"

const structure: DetectedStructure = {
  id: "citation-1",
  kind: "citation",
  page: 3,
  title: "참고 문헌 [1]",
  quote: "We directly adopt the planning method [1].",
  bounds: { x: 100, y: 200, width: 40, height: 14 },
  reference: {
    key: "1",
    title: "Planning Agents",
    authors: "Jane Doe",
    year: 2024,
    venue: "KDD",
    rawText: "[1] Jane Doe. Planning Agents.",
  },
}

describe("inline citation assessment", () => {
  it("uses the same conservative assessment contract as the citation sidebar", async () => {
    Object.defineProperty(window, "scourgify", {
      configurable: true,
      value: {
        lookupCitation: vi.fn(async () => ({
          status: "found",
          query: "Planning Agents",
          match: { score: 0.99, signals: ["title similarity 100%"], candidatesCompared: 2 },
          paper: {
            paperId: "paper-1",
            title: "Planning Agents",
            authors: ["Jane Doe"],
            year: 2024,
            venue: "KDD",
            abstract: "Planning for agents.",
            doi: null,
            url: null,
            openAccessUrl: null,
            citationCount: 10,
          },
        })),
      },
    })
    const ai = vi.fn(async (_request: Omit<AiRequest, "documentId">) =>
      JSON.stringify({
        breakdown: {
          dependency: 30,
          methodological: 25,
          conceptual: 20,
          evidentiary: 12,
          contextSufficiency: 9,
        },
        confidence: 0.95,
        citationReason: "방법을 직접 채택했습니다.",
        readingValue: "전체 방법을 확인해야 합니다.",
        reasons: ["직접 의존"],
        recommendedSections: ["full_text"],
        limitations: [],
      }),
    )

    const result = await assessCitationStructure(structure, "Current Paper", ai)

    expect(result.status).toBe("assessed")
    if (result.status === "assessed") {
      expect(result.assessment.tier).toBe("deep_read")
      expect(result.body).toContain("정독")
    }
    expect(ai.mock.lastCall?.[0]?.action).toBe("citation_assessment")
    Reflect.deleteProperty(window, "scourgify")
  })
})
