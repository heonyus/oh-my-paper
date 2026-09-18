import { describe, expect, it } from "vitest"
import {
  ProviderCapabilityResolver,
  type ProviderModelMetadata,
  resolveRoleRequest,
} from "../../src/electron/providerCapabilities"

const textModel: ProviderModelMetadata = {
  provider: "openrouter",
  model: "fake/text",
  metadataVersion: "v1",
  inputModalities: ["text"],
  outputModalities: ["text"],
  strictStructuredOutputs: false,
  supportedParameters: ["temperature", "max_tokens"],
  contextLimit: 32_000,
  outputLimit: 2_048,
  pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
  dataCollection: "deny",
}

describe("provider capabilities", () => {
  it("denies vision and structured roles before request assembly", () => {
    // Given
    const resolver = new ProviderCapabilityResolver(() => Promise.resolve(textModel))

    // When / Then
    expect(() => resolveRoleRequest(resolver.resolve(textModel), "structure")).toThrow(
      "unsupported_capability",
    )
    expect(() => resolveRoleRequest(resolver.resolve(textModel), "translation")).toThrow(
      "unsupported_capability",
    )
  })

  it("requires strict structured output and preserves role-specific routing", () => {
    // Given
    const resolver = new ProviderCapabilityResolver(() =>
      Promise.resolve({
        ...textModel,
        strictStructuredOutputs: true,
        outputModalities: ["json"],
        supportedParameters: [
          "temperature",
          "max_tokens",
          "response_format",
          "provider.require_parameters",
        ],
      }),
    )

    // When
    const resolution = resolver.resolve({
      ...textModel,
      strictStructuredOutputs: true,
      outputModalities: ["json"],
      supportedParameters: [
        "temperature",
        "max_tokens",
        "response_format",
        "provider.require_parameters",
      ],
    })

    // Then
    expect(resolveRoleRequest(resolution, "translation").parameters).toEqual({
      temperature: 0,
      max_tokens: 2_048,
      response_format: { type: "json_schema", json_schema: { strict: true } },
      provider: { require_parameters: ["response_format"] },
    })
  })

  it("does not reuse cached metadata across metadata versions", async () => {
    // Given
    let calls = 0
    const resolver = new ProviderCapabilityResolver(async () => {
      calls += 1
      return { ...textModel, metadataVersion: calls === 1 ? "v1" : "v2" }
    })

    // When
    await resolver.get("openrouter", "fake/text", "v1")
    await resolver.get("openrouter", "fake/text", "v2")

    // Then
    expect(calls).toBe(2)
  })
})
