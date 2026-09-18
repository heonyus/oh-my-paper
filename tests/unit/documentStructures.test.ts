import { describe, expect, it } from "vitest"
import { deriveDocumentStructures } from "../../src/renderer/lib/documentStructures"
import {
  pageIdSchema,
  type SourceDocumentAst,
  sourceDocumentAstSchema,
  sourceItemIdSchema,
} from "../../src/shared/documentAst"

const sourceHash = "b".repeat(64)

function sourceFixture(): SourceDocumentAst {
  return sourceDocumentAstSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash,
    extractorVersion: "test",
    pages: [{ id: "page:1", page: 1, width: 600, height: 800 }],
    items: [
      {
        id: "item:1.0",
        pageId: "page:1",
        text: "2 Methods",
        normalizedStart: 0,
        normalizedEnd: 9,
        bounds: { x: 40, y: 40, width: 100, height: 14 },
      },
      {
        id: "item:1.1",
        pageId: "page:1",
        text: "Figure 1. Pipeline overview",
        normalizedStart: 10,
        normalizedEnd: 37,
        bounds: { x: 40, y: 120, width: 220, height: 14 },
      },
      {
        id: "item:1.2",
        pageId: "page:1",
        text: "E(x) = sum_i x_i^2",
        normalizedStart: 38,
        normalizedEnd: 57,
        bounds: { x: 40, y: 180, width: 180, height: 14 },
      },
      {
        id: "item:1.3",
        pageId: "page:1",
        text: "[3]",
        normalizedStart: 58,
        normalizedEnd: 61,
        bounds: { x: 40, y: 240, width: 18, height: 14 },
      },
    ],
  })
}

describe("document structures", () => {
  it("retains exact source ranges and stable IDs for local structures", () => {
    // Given
    const source = sourceFixture()

    // When
    const first = deriveDocumentStructures(source)
    const second = deriveDocumentStructures(source)

    // Then
    expect(first.nodes).toEqual(second.nodes)
    expect(first.nodes.map((node) => node.kind)).toEqual(["heading", "caption", "equation"])
    expect(first.nodes.find((node) => node.kind === "caption")?.sourceRange).toMatchObject({
      start: 10,
      end: 37,
    })
    expect(first.nodes.every((node) => node.sourceRange.sourceItemIds.length > 0)).toBe(true)
  })

  it("assigns one caption to one evidenced visual and leaves naked markers out", () => {
    // Given
    const source = sourceFixture()

    // When
    const result = deriveDocumentStructures(source, {
      visualRegions: [
        {
          id: "visual:figure-1",
          pageId: pageIdSchema.parse("page:1"),
          kind: "figure",
          sourceItemIds: [sourceItemIdSchema.parse("item:1.1")],
          bounds: { x: 40, y: 70, width: 220, height: 45 },
        },
      ],
    })

    // Then
    expect(result.captionOwnership).toHaveLength(1)
    expect(result.captionOwnership[0]?.status).toBe("owned")
    expect(result.edges.filter((edge) => edge.kind === "caption")).toHaveLength(1)
    expect(result.nodes.some((node) => node.text === "[3]")).toBe(false)
  })

  it("joins split headings and classifies page-bottom notes locally", () => {
    // Given
    const source = sourceDocumentAstSchema.parse({
      ...sourceFixture(),
      items: [
        {
          id: "item:1.0",
          pageId: "page:1",
          text: "2",
          normalizedStart: 0,
          normalizedEnd: 1,
          bounds: { x: 40, y: 40, width: 10, height: 14 },
        },
        {
          id: "item:1.1",
          pageId: "page:1",
          text: "Methods",
          normalizedStart: 2,
          normalizedEnd: 9,
          bounds: { x: 56, y: 40, width: 70, height: 14 },
        },
        {
          id: "item:1.2",
          pageId: "page:1",
          text: "1 This note stays local",
          normalizedStart: 10,
          normalizedEnd: 33,
          bounds: { x: 40, y: 700, width: 170, height: 14 },
        },
      ],
    })

    // When
    const result = deriveDocumentStructures(source)

    // Then
    expect(result.nodes.map((node) => node.kind)).toEqual(["heading", "footnote"])
    expect(result.nodes[0]?.sourceRange.sourceItemIds).toEqual(["item:1.0", "item:1.1"])
  })
})
