import { describe, expect, it } from "vitest"
import { deriveDocumentCitations } from "../../src/renderer/lib/documentCitations"
import { type SourceDocumentAst, sourceDocumentAstSchema } from "../../src/shared/documentAst"

const sourceHash = "c".repeat(64)

function sourceFixture(): SourceDocumentAst {
  const pageOne = "Prior work [3, 5-7] follows (Rivera and Chen, 2024)."
  const references = [
    "References",
    "[3] Rivera. Earlier findings. Journal.",
    "[5] Stone. Numeric five. Journal.",
    "[6] Hall. Numeric six. Journal.",
    "[7] Park. Numeric seven. Journal.",
    "Rivera and Chen. 2024. Deterministic citations. Journal.",
  ]
  const pageTwo = references.join(" ")
  return sourceDocumentAstSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash,
    extractorVersion: "test",
    pages: [
      { id: "page:1", page: 1, width: 600, height: 800 },
      { id: "page:2", page: 2, width: 600, height: 800 },
    ],
    items: [
      {
        id: "item:1.0",
        pageId: "page:1",
        text: pageOne,
        normalizedStart: 0,
        normalizedEnd: pageOne.length,
        bounds: { x: 40, y: 60, width: 520, height: 14 },
      },
      {
        id: "item:2.0",
        pageId: "page:2",
        text: pageTwo,
        normalizedStart: 0,
        normalizedEnd: pageTwo.length,
        bounds: { x: 40, y: 60, width: 520, height: 70 },
      },
    ],
  })
}

describe("document citations", () => {
  it("expands numeric ranges and links only deterministic author-year candidates", () => {
    // Given
    const source = sourceFixture()

    // When
    const result = deriveDocumentCitations(source)

    // Then
    const numeric = result.occurrences.find((occurrence) => occurrence.form === "numeric")
    const authorYear = result.occurrences.find((occurrence) => occurrence.form === "author_year")
    expect(numeric?.referenceKeys).toEqual(["3", "5", "6", "7"])
    expect(authorYear?.resolution).toBe("resolved")
    expect(result.edges.filter((edge) => edge.kind === "reference")).toHaveLength(5)
    expect(
      result.occurrences.every(
        (occurrence) => occurrence.sourceRange.end > occurrence.sourceRange.start,
      ),
    ).toBe(true)
  })

  it("keeps duplicate bibliography identities ambiguous without an edge", () => {
    // Given
    const source = sourceDocumentAstSchema.parse({
      ...sourceFixture(),
      items: [
        {
          id: "item:1.0",
          pageId: "page:1",
          text: "Prior work [3].",
          normalizedStart: 0,
          normalizedEnd: 15,
          bounds: { x: 40, y: 60, width: 200, height: 14 },
        },
        {
          id: "item:2.0",
          pageId: "page:2",
          text: "References [3] Rivera. One. Journal. [3] Rivera. Two. Journal.",
          normalizedStart: 0,
          normalizedEnd: 63,
          bounds: { x: 40, y: 60, width: 520, height: 30 },
        },
      ],
    })

    // When
    const result = deriveDocumentCitations(source)

    // Then
    expect(result.bibliography.filter((entry) => entry.referenceKey === "3")).toHaveLength(2)
    expect(result.occurrences[0]?.resolution).toBe("ambiguous")
    expect(result.edges).toHaveLength(0)
  })

  it("does not resolve a four-digit bracketed year as a numeric citation", () => {
    const source = sourceDocumentAstSchema.parse({
      ...sourceFixture(),
      items: [
        {
          id: "item:1.0",
          pageId: "page:1",
          text: "The 2013 result is unrelated to a numeric citation.",
          normalizedStart: 0,
          normalizedEnd: 52,
          bounds: { x: 40, y: 60, width: 400, height: 14 },
        },
        {
          id: "item:2.0",
          pageId: "page:2",
          text: "References [2013] A paper. Journal.",
          normalizedStart: 0,
          normalizedEnd: 36,
          bounds: { x: 40, y: 60, width: 400, height: 14 },
        },
      ],
    })

    const result = deriveDocumentCitations(source)

    expect(result.occurrences).toHaveLength(0)
    expect(result.bibliography.some((entry) => entry.referenceKey === "2013")).toBe(false)
  })
})
