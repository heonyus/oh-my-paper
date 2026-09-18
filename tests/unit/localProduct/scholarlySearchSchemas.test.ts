// @vitest-environment node
import { describe, expect, it } from "vitest"
import { scholarlySearchRequestSchema } from "../../../src/shared/scholarlySearchSchemas"

describe("scholarly search schemas", () => {
  it("parses an explicit bounded search request", () => {
    // Given
    const input = {
      query: "retrieval augmented generation",
      providers: ["crossref", "arxiv", "openalex"],
      filters: { fromYear: 2020, toYear: 2026 },
      page: 2,
      pageSize: 40,
    }

    // When
    const result = scholarlySearchRequestSchema.parse(input)

    // Then
    expect(result).toEqual(input)
  })

  it("rejects duplicate providers and display limits above 100", () => {
    // Given
    const duplicateProviders = {
      query: "bounded search",
      providers: ["crossref", "crossref"],
    }

    // When
    const duplicateResult = scholarlySearchRequestSchema.safeParse(duplicateProviders)
    const oversizedResult = scholarlySearchRequestSchema.safeParse({
      query: "bounded search",
      pageSize: 101,
    })

    // Then
    expect(duplicateResult.success).toBe(false)
    expect(oversizedResult.success).toBe(false)
  })
})
