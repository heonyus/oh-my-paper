import { describe, expect, it } from "vitest"
import { buildCitationIndex } from "../../src/renderer/lib/pdfCitationIndex"

describe("PDF citation index", () => {
  it("links grouped numeric citations to bounded source contexts", () => {
    const result = buildCitationIndex(
      {
        "12": {
          key: "12",
          title: "Clinical Agent Systems",
          authors: "Jane Doe",
          year: 2024,
          venue: "KDD",
          rawText: "[12] Jane Doe. Clinical Agent Systems. doi:10.1234/example",
        },
      },
      [
        "Prior work is limited.",
        "Clinical agents use planning and execution feedback [9, 12, 14] for robust decisions.",
      ],
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.contexts[0]).toMatchObject({ page: 2 })
    expect(result[0]?.contexts[0]?.text).toContain("planning and execution feedback")
    expect(result[0]?.doi).toBe("10.1234/example")
  })
})
