import { describe, expect, it } from "vitest"
import {
  structureResolverInputSchema,
  validateStructureResolverOutput,
} from "../../src/electron/structureResolverJob"

const input = structureResolverInputSchema.parse({
  sourceHash: "a".repeat(64),
  candidateNodeIds: ["node:a", "node:b"],
  context: "A then B",
})

describe("structure resolver role", () => {
  it("accepts only relations among supplied candidates", () => {
    // Given / When
    const result = validateStructureResolverOutput(input, {
      orderedNodeIds: ["node:b", "node:a"],
      relations: [
        { from: "node:b", to: "node:a", kind: "order", confidence: 0.9, reason: "context" },
      ],
    })

    // Then
    expect(result.orderedNodeIds).toEqual(["node:b", "node:a"])
  })

  it("rejects an invented node without creating enrichment", () => {
    // Given / When / Then
    expect(() =>
      validateStructureResolverOutput(input, {
        orderedNodeIds: ["node:a", "node:invented"],
        relations: [],
      }),
    ).toThrow("malformed_output")
  })
})
