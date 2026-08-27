import { describe, expect, it } from "vitest"
import { aiRequestSchema, providerConfigSchema } from "../../src/shared/ipc"

const base = {
  action: "figure",
  documentId: "aabbccddeeff0011",
  page: 3,
  quote: "Figure 2: model architecture",
  before: "",
  after: "",
  featureKind: "figure",
} as const

describe("AI feature request boundary", () => {
  it("accepts an explicitly clicked local image crop", () => {
    const result = aiRequestSchema.safeParse({
      ...base,
      imageDataUrl: "data:image/png;base64,aG90ZWJvb2s=",
    })

    expect(result.success).toBe(true)
  })

  it("rejects non-image data payloads", () => {
    const result = aiRequestSchema.safeParse({
      ...base,
      imageDataUrl: "data:text/plain;base64,aG90ZWJvb2s=",
    })

    expect(result.success).toBe(false)
  })

  it("accepts bounded paper-chat history", () => {
    const result = aiRequestSchema.safeParse({
      ...base,
      action: "chat",
      quote: "이 논문의 핵심 기여가 뭐야?",
      history: [
        { role: "user", content: "연구 질문을 먼저 알려줘" },
        { role: "assistant", content: "임상 의사결정 자동화입니다." },
      ],
    })

    expect(result.success).toBe(true)
  })

  it("accepts OpenAI and OpenRouter provider configuration", () => {
    expect(
      providerConfigSchema.safeParse({
        provider: "openai",
        apiKey: "sk-example-key-at-least-twenty-characters",
        model: "gpt-5",
      }).success,
    ).toBe(true)
    expect(
      providerConfigSchema.safeParse({
        provider: "openrouter",
        apiKey: "sk-or-example-key-at-least-twenty-characters",
        model: "openai/gpt-5",
      }).success,
    ).toBe(true)
  })
})
