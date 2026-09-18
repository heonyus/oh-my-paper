import OpenAI from "openai"
import { APIError } from "openai/error"
import type { ProviderConfig } from "../shared/ipc"
import { ProviderConfigurationError } from "./providerConfigStore"

export function providerClient(config: ProviderConfig): OpenAI {
  const bases: Readonly<Record<ProviderConfig["provider"], string>> = {
    openai: "https://api.openai.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
    groq: "https://api.groq.com/openai/v1",
    opencodex: "http://127.0.0.1:10100/v1",
  }
  return new OpenAI({
    apiKey: "apiKey" in config ? config.apiKey : "local-opencodex",
    baseURL: bases[config.provider],
    maxRetries: 0,
    timeout: 120_000,
  })
}

export function providerFailure(error: unknown): Error {
  if (error instanceof ProviderConfigurationError) return error
  if (error instanceof APIError) {
    if (error.status === 401 || error.status === 403) return new ProviderConfigurationError("auth")
    if (error.status === 429) return new ProviderConfigurationError("rate_limited")
  }
  if (error instanceof Error && error.name === "AbortError")
    return new ProviderConfigurationError("cancelled")
  if (error instanceof Error && error.name === "APIUserAbortError")
    return new ProviderConfigurationError("cancelled")
  if (error instanceof Error && /abort/iu.test(error.message))
    return new ProviderConfigurationError("cancelled")
  return new ProviderConfigurationError("request_failed")
}
