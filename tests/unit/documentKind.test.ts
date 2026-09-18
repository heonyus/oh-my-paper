import { describe, expect, it } from "vitest"
import { detectDocumentKind } from "../../src/shared/documentKind"

describe("local document kind detection", () => {
  it.each([
    ["Abstract Introduction Methods Results References", "research_paper"],
    ["Executive Summary Findings Recommendations", "report"],
    ["User Manual Installation Instructions Troubleshooting", "manual"],
    ["Agreement between the parties Effective Date Governing Law", "contract"],
  ] as const)("classifies %s", (text, expected) => {
    expect(detectDocumentKind(text, 8)).toBe(expected)
  })

  it("keeps an unfamiliar PDF as a general document", () => {
    expect(detectDocumentKind("Neighborhood archive notes and scanned receipts", 2)).toBe(
      "document",
    )
  })
})
