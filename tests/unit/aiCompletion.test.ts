import { describe, expect, it } from "vitest"
import {
  completionLimitParameters,
  completionTokenLimit,
  routedModelForRequest,
} from "../../src/electron/aiCompletion"
import type { AiRequest } from "../../src/shared/ipc"
import { documentIdSchema } from "../../src/shared/schemas"

const request: AiRequest = {
  action: "translation",
  documentId: documentIdSchema.parse("aabbccddeeff0011"),
  page: 19,
  quote: "demonstrates",
  before: "",
  after: "",
}

describe("AI completion budget", () => {
  it("uses a small output limit for a short translation", () => {
    // Given / When / Then
    expect(completionTokenLimit(request)).toBe(64)
  })

  it("bounds citation assessment for interactive reading", () => {
    // Given / When / Then
    const assessment = { ...request, action: "citation_assessment" } satisfies AiRequest
    expect(completionTokenLimit(assessment)).toBe(768)
    expect(completionLimitParameters("openrouter", assessment)).toEqual({
      max_tokens: 768,
      reasoning_effort: "low",
      temperature: 0,
    })
    expect(routedModelForRequest("openrouter", "z-ai/glm-5.3-flash", assessment)).toBe(
      "z-ai/glm-5.3-flash:nitro",
    )
  })

  it("bounds section explanations for interactive reading", () => {
    // Given / When / Then
    expect(completionTokenLimit({ ...request, action: "section" })).toBe(320)
    expect(completionLimitParameters("openrouter", { ...request, action: "section" })).toEqual({
      max_tokens: 320,
      reasoning_effort: "low",
      temperature: 0,
    })
  })

  it("uses the OpenRouter-compatible output limit field", () => {
    // Given / When / Then
    expect(completionLimitParameters("openrouter", request)).toEqual({
      max_tokens: 64,
      reasoning_effort: "low",
      temperature: 0,
    })
  })

  it("uses the current OpenAI output limit field for direct requests", () => {
    // Given / When / Then
    expect(completionLimitParameters("openai", request)).toEqual({
      max_completion_tokens: 64,
    })
  })

  it("routes bounded OpenRouter reading actions through the Nitro variant", () => {
    // Given / When / Then
    expect(
      routedModelForRequest("openrouter", "z-ai/glm-5.3-flash", {
        ...request,
        action: "section",
      }),
    ).toBe("z-ai/glm-5.3-flash:nitro")
    expect(routedModelForRequest("openrouter", "z-ai/glm-5.3-flash", request)).toBe(
      "z-ai/glm-5.3-flash:nitro",
    )
  })

  it("preserves direct OpenAI and explicit OpenRouter variants", () => {
    // Given / When / Then
    expect(routedModelForRequest("openai", "gpt-5", request)).toBe("gpt-5")
    expect(routedModelForRequest("openrouter", "z-ai/glm-5.3-flash:floor", request)).toBe(
      "z-ai/glm-5.3-flash:floor",
    )
  })
})
