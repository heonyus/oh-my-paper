import { describe, expect, it } from "vitest"
import { documentAstBundleSchema } from "../../src/shared/documentAst"

const sourceHash = "a".repeat(64)

describe("document AST contract", () => {
  it("accepts immutable source and semantic artifacts with linked provenance", () => {
    // Given
    const artifact = {
      source: {
        schemaVersion: "1.0.0",
        sourceHash,
        extractorVersion: "pdfjs-4",
        pages: [{ id: "page:1", page: 1, width: 595, height: 842 }],
        items: [
          {
            id: "item:1",
            pageId: "page:1",
            text: "Synthetic heading",
            normalizedStart: 0,
            normalizedEnd: 17,
            bounds: { x: 40, y: 40, width: 100, height: 12 },
          },
        ],
      },
      semantic: {
        schemaVersion: "1.0.0",
        sourceHash,
        layoutVersion: "local-1",
        nodes: [
          {
            id: "node:1",
            kind: "heading",
            pageId: "page:1",
            sourceItemIds: ["item:1"],
            confidence: 0.9,
            origin: "deterministic",
          },
        ],
        edges: [],
      },
      enrichment: {
        schemaVersion: "1.0.0",
        sourceHash,
        candidates: [{ nodeId: "node:1", kind: "reading_order", confidence: 0.7, origin: "ai" }],
      },
    }

    // When
    const result = documentAstBundleSchema.safeParse(artifact)

    // Then
    expect(result.success).toBe(true)
  })

  it("rejects enrichment references that are not deterministic semantic nodes", () => {
    // Given
    const artifact = {
      source: {
        schemaVersion: "1.0.0",
        sourceHash,
        extractorVersion: "pdfjs-4",
        pages: [{ id: "page:1", page: 1, width: 595, height: 842 }],
        items: [],
      },
      semantic: {
        schemaVersion: "1.0.0",
        sourceHash,
        layoutVersion: "local-1",
        nodes: [],
        edges: [],
      },
      enrichment: {
        schemaVersion: "1.0.0",
        sourceHash,
        candidates: [
          { nodeId: "node:invented", kind: "reading_order", confidence: 0.7, origin: "ai" },
        ],
      },
    }

    // When
    const result = documentAstBundleSchema.safeParse(artifact)

    // Then
    expect(result.success).toBe(false)
  })
})
