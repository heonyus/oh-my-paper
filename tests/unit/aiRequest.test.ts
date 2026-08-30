import { describe, expect, it } from "vitest"
import {
  aiRequestSchema,
  aiStreamDeltaSchema,
  aiStreamRequestSchema,
  providerConfigSchema,
} from "../../src/shared/ipc"

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

  it("accepts explicit paper and section context alongside a multimodal figure", () => {
    const result = aiRequestSchema.safeParse({
      ...base,
      paperContext: "cached paper summary",
      sectionContext: "nearby results section",
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

  it("accepts the full overview context and rejects text above its boundary", () => {
    expect(aiRequestSchema.safeParse({ ...base, quote: "a".repeat(8_000) }).success).toBe(true)
    expect(aiRequestSchema.safeParse({ ...base, quote: "a".repeat(8_001) }).success).toBe(false)
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

describe("AI stream IPC boundary", () => {
  it("binds every delta to a validated request id", () => {
    const id = "68b62f6a-9547-4c25-9001-b7ec7cb8e69e"
    const request = aiRequestSchema.parse({ ...base, action: "translation" })

    expect(aiStreamRequestSchema.parse({ id, request }).id).toBe(id)
    expect(aiStreamDeltaSchema.parse({ id, delta: "검" }).delta).toBe("검")
    expect(() => aiStreamDeltaSchema.parse({ id, delta: "" })).toThrow()
  })
})
