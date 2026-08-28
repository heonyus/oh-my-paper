import { describe, expect, it } from "vitest"
import {
  DEFAULT_OPENAI_MODEL,
  providerConfigFromEnvironment,
} from "../../src/electron/providerEnvironment"

describe("provider environment configuration", () => {
  it("loads a development OpenAI key without exposing it to the renderer", () => {
    expect(
      providerConfigFromEnvironment({
        SCOURGIFY_AI_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-example-key-at-least-twenty-characters",
      }),
    ).toEqual({
      provider: "openai",
      apiKey: "sk-example-key-at-least-twenty-characters",
      model: DEFAULT_OPENAI_MODEL,
    })
  })

  it("uses OpenRouter only when its own key is present", () => {
    expect(
      providerConfigFromEnvironment({
        SCOURGIFY_AI_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "sk-or-example-key-at-least-twenty-characters",
        SCOURGIFY_AI_MODEL: "anthropic/claude-sonnet-4.6",
      }),
    ).toMatchObject({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.6",
    })
  })

  it("fails closed when no valid key is configured", () => {
    expect(providerConfigFromEnvironment({ SCOURGIFY_AI_PROVIDER: "openai" })).toBeNull()
  })
})
