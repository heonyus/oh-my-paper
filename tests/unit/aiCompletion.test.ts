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

  it("bounds mapped page-translation batches for low-latency streaming", () => {
    expect(completionTokenLimit({ ...request, action: "page_translation" })).toBe(2_048)
    expect(
      completionLimitParameters("openrouter", { ...request, action: "page_translation" })
        .response_format?.json_schema.name,
    ).toBe("page_translation")
  })

  it("requests strict structured output for multimodal page structure", () => {
    expect(
      completionLimitParameters("openrouter", { ...request, action: "page_structure" })
        .response_format?.json_schema.name,
    ).toBe("page_structure")
  })

  it("reserves enough output for a researcher-oriented figure explanation", () => {
    expect(completionTokenLimit({ ...request, action: "figure" })).toBe(1_280)
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
    expect(completionTokenLimit({ ...request, action: "section" })).toBe(1_536)
    expect(completionLimitParameters("openrouter", { ...request, action: "section" })).toEqual({
      max_tokens: 1_536,
      reasoning_effort: "low",
      temperature: 0,
    })
  })

  it("keeps automatic overview responses short and low-latency", () => {
    expect(completionTokenLimit({ ...request, action: "keywords" })).toBe(224)
    expect(completionTokenLimit({ ...request, action: "three_line_summary" })).toBe(192)
    expect(completionTokenLimit({ ...request, action: "paper_summary" })).toBe(384)
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

  it("uses minimal reasoning for direct Gemini translation", () => {
    const parameters = completionLimitParameters("gemini", request)
    expect(parameters).toMatchObject({
      max_completion_tokens: 64,
      reasoning_effort: "minimal",
      temperature: 0,
    })
    expect(parameters.response_format).toBeUndefined()
    const pageParameters = completionLimitParameters("gemini", {
      ...request,
      action: "page_translation",
    })
    expect(pageParameters.response_format?.json_schema.name).toBe("page_translation_gemini")
    expect(JSON.stringify(pageParameters.response_format)).not.toMatch(
      /pattern|minLength|maxLength|minItems|maxItems/u,
    )
  })

  it("uses low reasoning for the Groq speed fallback", () => {
    expect(completionLimitParameters("groq", request)).toEqual({
      max_completion_tokens: 64,
      reasoning_effort: "low",
      temperature: 0,
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
