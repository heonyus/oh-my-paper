import { describe, expect, it } from "vitest"
import {
  translationInputSchema,
  validateTranslationOutput,
} from "../../src/electron/translationJob"

const input = translationInputSchema.parse({
  sourceHash: "b".repeat(64),
  blocks: [
    { id: "block:a", text: "See [source](https://example.com/a)." },
    { id: "block:b", text: "Second block." },
  ],
})

describe("translation role", () => {
  it("requires one complete mapping in source order and preserves citation links", () => {
    // Given / When
    const result = validateTranslationOutput(input, {
      mappings: [
        { id: "block:a", text: "[source](https://example.com/a)를 보라." },
        { id: "block:b", text: "두 번째 블록." },
      ],
    })

    // Then
    expect(result.mappings).toHaveLength(2)
  })

  it("fails closed for missing or reordered mappings", () => {
    // Given / When / Then
    expect(() =>
      validateTranslationOutput(input, {
        mappings: [{ id: "block:b", text: "두 번째 블록." }],
      }),
    ).toThrow("malformed_output")
  })
})
