import type { ProviderConfig } from "../shared/ipc"
import { providerConfigSchema, providerKindSchema } from "../shared/ipc"
import { DEFAULT_OPENROUTER_MODEL } from "../shared/providerModels"

export const DEFAULT_OPENAI_MODEL = "gpt-5"

export type ProviderEnvironment = {
  readonly SCOURGIFY_AI_PROVIDER?: string
  readonly SCOURGIFY_AI_MODEL?: string
  readonly OPENAI_API_KEY?: string
  readonly OPENROUTER_API_KEY?: string
}

export function providerConfigFromEnvironment(
  environment: ProviderEnvironment,
): ProviderConfig | null {
  const requested = providerKindSchema.safeParse(environment.SCOURGIFY_AI_PROVIDER)
  const inferred = environment.OPENROUTER_API_KEY ? "openrouter" : "openai"
  const provider = requested.success ? requested.data : inferred
  const apiKey =
    provider === "openrouter" ? environment.OPENROUTER_API_KEY : environment.OPENAI_API_KEY
  if (!apiKey) return null
  const model =
    environment.SCOURGIFY_AI_MODEL?.trim() ||
    (provider === "openrouter" ? DEFAULT_OPENROUTER_MODEL : DEFAULT_OPENAI_MODEL)
  const parsed = providerConfigSchema.safeParse({ provider, apiKey, model })
  return parsed.success ? parsed.data : null
}
