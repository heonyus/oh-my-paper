// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  bibliographyMetadataSchema,
  bibliographyUpdateInputSchema,
} from "../../../src/shared/bibliographySchemas"

describe("bibliography schemas", () => {
  it("parses bounded native paper metadata", () => {
    // Given
    const input = {
      citationKey: "lee2026evidence",
      authors: ["Minji Park"],
      year: 2026,
      doi: "10.1000/example",
      arxivId: "2501.01234v2",
      venue: "Journal of Clinical Informatics",
      tags: ["EHR", "agents"],
      readingState: "reading",
    }

    // When
    const parsed = bibliographyMetadataSchema.parse(input)

    // Then
    expect(parsed).toEqual(input)
  })

  it("rejects invalid years and unbounded author lists", () => {
    // Given
    const base = {
      paperNodeId: "11111111-1111-4111-8111-111111111111",
      title: "Evidence systems",
      authors: ["Author"],
      year: 2026,
      doi: null,
      arxivId: null,
      venue: "",
      tags: [],
      readingState: "unread",
    }

    // When
    const invalidYear = bibliographyUpdateInputSchema.safeParse({ ...base, year: 999 })
    const tooManyAuthors = bibliographyUpdateInputSchema.safeParse({
      ...base,
      authors: Array.from({ length: 65 }, (_, index) => `Author ${index}`),
    })

    // Then
    expect(invalidYear.success).toBe(false)
    expect(tooManyAuthors.success).toBe(false)
  })
})
