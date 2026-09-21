import type { ResponseFormatJSONSchema } from "openai/resources/shared"
import { describe, expect, it } from "vitest"
import { shouldContinueCompletion } from "../../src/electron/providerCompletion"

const structuredResponse = {
  type: "json_schema",
  json_schema: {
    name: "translation",
    strict: true,
    schema: { type: "object", properties: {}, additionalProperties: false },
  },
} satisfies ResponseFormatJSONSchema

describe("provider completion continuation", () => {
  it("continues ordinary prose after a length finish", () => {
    expect(shouldContinueCompletion({}, "length")).toBe(true)
  })

  it("does not concatenate a second response for structured JSON", () => {
    expect(shouldContinueCompletion({ response_format: structuredResponse }, "length")).toBe(false)
  })
})
