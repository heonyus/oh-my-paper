import { describe, expect, it } from "vitest"
import {
  citationAssessmentInputSchema,
  validateCitationAssessmentInput,
} from "../../src/electron/citationAssessmentJob"

describe("citation assessment role", () => {
  it("requires a verified metadata candidate", () => {
    // Given / When / Then
    expect(() =>
      validateCitationAssessmentInput(
        citationAssessmentInputSchema.parse({
          citationContext: "This method follows [1].",
          candidate: null,
        }),
      ),
    ).toThrow("unverified_citation_candidate")
  })

  it("accepts deterministic context with a verified candidate", () => {
    // Given / When
    const result = validateCitationAssessmentInput(
      citationAssessmentInputSchema.parse({
        citationContext: "This method follows [1].",
        candidate: {
          verified: true,
          paperId: "paper-1",
          title: "A verified paper",
          authors: ["Author"],
          year: 2024,
        },
      }),
    )

    // Then
    expect(result.candidate.paperId).toBe("paper-1")
  })
})
