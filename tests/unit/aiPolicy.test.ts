import { describe, expect, it } from "vitest"
import { aiJobSchema, aiPolicy } from "../../src/shared/documentAiJobs"

describe("document AI policy", () => {
  it("accepts bounded translation work", () => {
    // Given
    const job = {
      id: "job:alpha",
      role: "translation",
      sourceGeneration: 1,
      input: { characterCount: 12_000, outputTokens: 2_048 },
    }

    // When
    const result = aiJobSchema.safeParse(job)

    // Then
    expect(result.success).toBe(true)
  })

  it("rejects a translation batch beyond the policy before provider work", () => {
    // Given
    const job = {
      id: "job:alpha",
      role: "translation",
      sourceGeneration: 1,
      input: { characterCount: aiPolicy.translationCharacters + 1, outputTokens: 2_048 },
    }

    // When
    const result = aiJobSchema.safeParse(job)

    // Then
    expect(result.success).toBe(false)
  })
})
