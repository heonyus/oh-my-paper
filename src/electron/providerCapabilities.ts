import { z } from "zod"
import type { AiRole } from "../shared/documentAiJobs"

const modalitySchema = z.enum(["text", "image"])
const parameterSchema = z.enum([
  "temperature",
  "max_tokens",
  "max_completion_tokens",
  "response_format",
  "provider.require_parameters",
])
const pricingSchema = z
  .object({
    inputUsdPerMillion: z.number().nonnegative(),
    outputUsdPerMillion: z.number().nonnegative(),
  })
  .strict()

export const providerModelMetadataSchema = z
  .object({
    provider: z.enum(["openai", "openrouter", "opencodex"]),
    model: z.string().min(1).max(160),
    actualModel: z.string().min(1).max(160).optional(),
    metadataVersion: z.string().min(1).max(160),
    inputModalities: z.array(modalitySchema).min(1).readonly(),
    outputModalities: z
      .array(z.enum(["text", "json"]))
      .min(1)
      .readonly(),
    strictStructuredOutputs: z.boolean(),
    supportedParameters: z.array(parameterSchema).readonly(),
    contextLimit: z.number().int().positive(),
    outputLimit: z.number().int().positive(),
    pricing: pricingSchema.nullable(),
    dataCollection: z.enum(["deny", "allow", "unknown"]),
  })
  .strict()

export type ProviderModelMetadata = z.infer<typeof providerModelMetadataSchema>
export type ProviderRoleResolution = {
  readonly role: AiRole
  readonly model: string
  readonly inputModality: "text" | "image"
  readonly structured: boolean
  readonly pricingKnown: boolean
  readonly parameters: Readonly<RoleParameters>
}

type RoleParameters = {
  temperature?: 0
  max_tokens?: number
  max_completion_tokens?: number
  response_format?: {
    readonly type: "json_schema"
    readonly json_schema: { readonly strict: true }
  }
  provider?: { readonly require_parameters: readonly ["response_format"] }
}

export class UnsupportedCapabilityError extends Error {
  readonly name = "UnsupportedCapabilityError"

  constructor(
    readonly reason:
      | "vision_input"
      | "strict_structured_output"
      | "required_parameter"
      | "data_collection",
  ) {
    super("unsupported_capability")
  }
}

export type ProviderMetadataLoader = (
  provider: ProviderModelMetadata["provider"],
  model: string,
  metadataVersion: string,
) => Promise<ProviderModelMetadata>

export class ProviderCapabilityResolver {
  readonly #loader: ProviderMetadataLoader
  readonly #cache = new Map<string, ProviderModelMetadata>()

  constructor(loader: ProviderMetadataLoader) {
    this.#loader = loader
  }

  resolve(metadata: ProviderModelMetadata): ProviderModelMetadata {
    return providerModelMetadataSchema.parse(metadata)
  }

  async get(
    provider: ProviderModelMetadata["provider"],
    model: string,
    metadataVersion: string,
  ): Promise<ProviderModelMetadata> {
    const key = `${provider}:${model}:${metadataVersion}`
    const cached = this.#cache.get(key)
    if (cached) return cached
    const loaded = providerModelMetadataSchema.parse(
      await this.#loader(provider, model, metadataVersion),
    )
    if (
      loaded.provider !== provider ||
      loaded.model !== model ||
      loaded.metadataVersion !== metadataVersion
    ) {
      throw new UnsupportedCapabilityError("required_parameter")
    }
    this.#cache.set(key, loaded)
    return loaded
  }

  invalidate(provider: ProviderModelMetadata["provider"], model: string): void {
    for (const key of this.#cache.keys())
      if (key.startsWith(`${provider}:${model}:`)) this.#cache.delete(key)
  }
}

function hasParameter(metadata: ProviderModelMetadata, parameter: string): boolean {
  const parsed = parameterSchema.safeParse(parameter)
  return parsed.success && metadata.supportedParameters.includes(parsed.data)
}

export function resolveRoleRequest(
  metadata: ProviderModelMetadata,
  role: AiRole,
): ProviderRoleResolution {
  const parsed = providerModelMetadataSchema.parse(metadata)
  const needsVision = role === "structure"
  const structured = role !== "reader"
  if (needsVision && !parsed.inputModalities.includes("image"))
    throw new UnsupportedCapabilityError("vision_input")
  if (
    structured &&
    (!parsed.strictStructuredOutputs || !parsed.outputModalities.includes("json"))
  ) {
    throw new UnsupportedCapabilityError("strict_structured_output")
  }
  if (
    structured &&
    (!hasParameter(parsed, "response_format") ||
      (parsed.provider === "openrouter" && !hasParameter(parsed, "provider.require_parameters")))
  ) {
    throw new UnsupportedCapabilityError("required_parameter")
  }
  if (parsed.provider === "openrouter" && structured && parsed.dataCollection === "allow") {
    throw new UnsupportedCapabilityError("data_collection")
  }
  const parameters: RoleParameters = {}
  if (hasParameter(parsed, "temperature")) parameters.temperature = 0
  if (hasParameter(parsed, "max_tokens")) parameters.max_tokens = role === "citation" ? 768 : 2_048
  else if (hasParameter(parsed, "max_completion_tokens"))
    parameters.max_completion_tokens = role === "citation" ? 768 : 2_048
  if (structured) {
    parameters.response_format = { type: "json_schema", json_schema: { strict: true } }
    if (parsed.provider === "openrouter")
      parameters.provider = { require_parameters: ["response_format"] }
  }
  return {
    role,
    model: parsed.actualModel ?? parsed.model,
    inputModality: needsVision ? "image" : "text",
    structured,
    pricingKnown: parsed.pricing !== null,
    parameters,
  }
}
