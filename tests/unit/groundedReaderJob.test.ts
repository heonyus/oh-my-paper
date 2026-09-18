import { describe, expect, it } from "vitest"
import {
  GroundedReaderSession,
  groundedReaderInputSchema,
} from "../../src/electron/groundedReaderJob"

describe("grounded reader role", () => {
  it("requires bounded source-linked context and exposes completion only once", () => {
    // Given
    const input = groundedReaderInputSchema.parse({
      sourceHash: "c".repeat(64),
      sourceNodeIds: ["node:one"],
      context: "The result is 42.",
      question: "What is the result?",
    })
    const session = new GroundedReaderSession(input)

    // When
    session.push("The result is ")
    session.push("42.")

    // Then
    expect(session.complete("fake/model", 4, 3, 0.01)).toEqual({
      text: "The result is 42.",
      model: "fake/model",
      inputTokens: 4,
      outputTokens: 3,
      estimatedCostUsd: 0.01,
    })
    expect(session.isComplete()).toBe(true)
  })

  it("does not complete without source-linked IDs", () => {
    // Given / When / Then
    expect(() =>
      groundedReaderInputSchema.parse({
        sourceHash: "c".repeat(64),
        sourceNodeIds: [],
        context: "answer",
        question: "question",
      }),
    ).toThrow()
  })
})
