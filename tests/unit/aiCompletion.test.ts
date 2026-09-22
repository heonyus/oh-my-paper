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
    expect(completionTokenLimit({ ...request, action: "page_translation" })).toBe(4_096)
    expect(
      completionLimitParameters("openrouter", "z-ai/glm-5.3-flash", {
        ...request,
        action: "page_translation",
      }).response_format,
    ).toBeDefined()
    expect(
      completionLimitParameters("openrouter", "tencent/hy-mt2-7b", {
        ...request,
        action: "page_translation",
      }).response_format,
    ).toBeUndefined()
  })

  it("requests strict structured output for multimodal page structure", () => {
    expect(
      completionLimitParameters("openrouter", "z-ai/glm-5.3-flash", {
        ...request,
        action: "page_structure",
      }).response_format?.json_schema.name,
    ).toBe("page_structure")
  })

  it("reserves enough output for a researcher-oriented figure explanation", () => {
    expect(completionTokenLimit({ ...request, action: "figure" })).toBe(1_280)
  })

  it("bounds citation assessment for interactive reading", () => {
    // Given / When / Then
    const assessment = { ...request, action: "citation_assessment" } satisfies AiRequest
    expect(completionTokenLimit(assessment)).toBe(768)
    expect(completionLimitParameters("openrouter", "z-ai/glm-5.3-flash", assessment)).toEqual({
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
    expect(
      completionLimitParameters("openrouter", "z-ai/glm-5.3-flash", {
        ...request,
        action: "section",
      }),
    ).toEqual({
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
    expect(completionLimitParameters("openrouter", "z-ai/glm-5.3-flash", request)).toEqual({
      max_tokens: 64,
      reasoning_effort: "low",
      temperature: 0,
    })
  })

  it("uses the current OpenAI output limit field for direct requests", () => {
    // Given / When / Then
    expect(completionLimitParameters("openai", "gpt-4.1-mini", request)).toEqual({
      max_completion_tokens: 64,
    })
  })

  it("uses minimal reasoning for direct Gemini translation", () => {
    const parameters = completionLimitParameters("gemini", "gemini-2.5-flash", request)
    expect(parameters).toMatchObject({
      max_completion_tokens: 64,
      reasoning_effort: "minimal",
      temperature: 0,
    })
    expect(parameters.response_format).toBeUndefined()
    const pageParameters = completionLimitParameters("gemini", "gemini-2.5-flash", {
      ...request,
      action: "page_translation",
    })
    expect(pageParameters.response_format?.json_schema.name).toBe("page_translation_gemini")
    expect(JSON.stringify(pageParameters.response_format)).not.toMatch(
      /pattern|minLength|maxLength|minItems|maxItems/u,
    )
    expect(pageParameters.max_completion_tokens).toBe(4_096)
    expect(pageParameters.reasoning_effort).toBeUndefined()
    expect(pageParameters.temperature).toBeUndefined()
  })

  it("uses low reasoning for the Groq speed fallback", () => {
    expect(completionLimitParameters("groq", "openai/gpt-oss-20b", request)).toEqual({
      max_completion_tokens: 64,
      reasoning_effort: "low",
      temperature: 0,
    })
  })

  it("omits reasoning effort for non-reasoning OpenRouter models", () => {
    // Given: a model without a reasoning phase. Sending reasoning_effort would
    // enable a thinking budget that starves small completion caps.
    // When / Then
    expect(
      completionLimitParameters("openrouter", "google/gemini-2.5-flash-lite", request),
    ).toEqual({
      max_tokens: 64,
      temperature: 0,
    })
    expect(
      completionLimitParameters("openrouter", "deepseek/deepseek-v4-flash-0731", request),
    ).toEqual({
      max_tokens: 64,
      temperature: 0,
    })
  })

  it("disables DeepSeek V4.1 hidden reasoning for short reader responses", () => {
    expect(
      completionLimitParameters("openrouter", "deepseek/deepseek-v4.1-flash", {
        ...request,
        action: "keywords",
      }),
    ).toMatchObject({
      max_tokens: 224,
      reasoning: { effort: "none", exclude: true },
      temperature: 0,
    })
  })

  it("routes every OpenRouter page translation to the dedicated Hy-MT2 model", () => {
    expect(
      routedModelForRequest("openrouter", "deepseek/deepseek-v4.1-flash", {
        ...request,
        action: "page_translation",
      }),
    ).toBe("tencent/hy-mt2-30b-a3b")
    expect(
      routedModelForRequest(
        "openrouter",
        "deepseek/deepseek-v4.1-flash",
        { ...request, action: "page_translation" },
        "qwen/qwen3-30b-a3b-instruct-2507",
      ),
    ).toBe("qwen/qwen3-30b-a3b-instruct-2507")
    expect(
      routedModelForRequest(
        "openrouter",
        "deepseek/deepseek-v4.1-flash",
        { ...request, action: "page_translation" },
        "main",
      ),
    ).toBe("deepseek/deepseek-v4.1-flash")
    expect(
      completionLimitParameters("openrouter", "tencent/hy-mt2-30b-a3b", {
        ...request,
        action: "page_translation",
      }),
    ).toEqual({ max_tokens: 4_096, temperature: 0 })
    const translated = completionLimitParameters("openrouter", "qwen/qwen3-30b-a3b-instruct-2507", {
      ...request,
      action: "page_translation",
    })
    expect(translated.response_format).toBeDefined()
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
