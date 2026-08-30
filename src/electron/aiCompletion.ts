import type { AiRequest, ProviderConfig } from "../shared/ipc"

const readingTokenLimits: Readonly<Partial<Record<AiRequest["action"], number>>> = {
  citation_assessment: 768,
  explanation: 512,
  infographic: 512,
  section: 320,
  figure: 768,
  table: 768,
  equation: 512,
}

export function completionTokenLimit(request: AiRequest): number | undefined {
  if (request.action !== "translation") return readingTokenLimits[request.action]
  const characters = request.quote.trim().length
  if (characters <= 40) return 64
  if (characters <= 120) return 128
  return undefined
}

export function completionLimitParameters(
  provider: ProviderConfig["provider"],
  request: AiRequest,
): {
  readonly max_tokens?: number
  readonly max_completion_tokens?: number
  readonly reasoning_effort?: "low"
  readonly temperature?: 0
} {
  const limit = completionTokenLimit(request)
  if (!limit) return {}
  return provider === "openrouter"
    ? { max_tokens: limit, reasoning_effort: "low", temperature: 0 }
    : { max_completion_tokens: limit }
}

export function routedModelForRequest(
  provider: ProviderConfig["provider"],
  model: string,
  request: AiRequest,
): string {
  const variantIndex = model.indexOf(":", model.lastIndexOf("/"))
  return provider === "openrouter" && completionTokenLimit(request) && variantIndex < 0
    ? `${model}:nitro`
    : model
}
