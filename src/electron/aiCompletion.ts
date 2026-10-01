import type { AiRequest, ProviderConfig } from "../shared/ipc"
import { pageStructureResponseFormat } from "../shared/pageStructure"
import {
  geminiPageTranslationResponseFormat,
  pageTranslationResponseFormat,
} from "../shared/pageTranslationProtocol"
import {
  isHyMtModel,
  isOpenRouterPageTranslationModel,
  OPENROUTER_PAGE_TRANSLATION_MODEL,
  PAGE_TRANSLATION_MAIN_MODEL,
} from "../shared/providerModels"

const readingTokenLimits: Readonly<Partial<Record<AiRequest["action"], number>>> = {
  // Room for the prompts' own length targets; Korean takes more tokens per character.
  keywords: 512,
  three_line_summary: 450,
  paper_summary: 900,
  citation_assessment: 768,
  note_tutor: 700,
  explanation: 1_536,
  // A whole HTML fragment, markup included.
  infographic: 4_096,
  section: 1_536,
  figure: 1_280,
  table: 1_280,
  equation: 1_024,
  citation: 1_024,
  page_structure: 8_192,
  page_translation: 8_192,
}

export function completionTokenLimit(request: AiRequest): number | undefined {
  if (request.action !== "translation") return readingTokenLimits[request.action]
  const characters = request.quote.trim().length
  if (characters <= 40) return 64
  if (characters <= 120) return 128
  return undefined
}

const nitroBaseModel = "z-ai/glm-5.3-flash"

function usesReasoningEffort(model: string): boolean {
  return model === nitroBaseModel || model === `${nitroBaseModel}:nitro`
}

export function completionLimitParameters(
  provider: ProviderConfig["provider"],
  model: string,
  request: AiRequest,
): {
  readonly max_tokens?: number
  readonly max_completion_tokens?: number
  readonly reasoning_effort?: "minimal" | "low"
  readonly reasoning?: {
    readonly effort?: "none" | "minimal" | "low"
    readonly exclude?: boolean
  }
  readonly temperature?: 0
  readonly response_format?:
    | typeof pageStructureResponseFormat
    | typeof geminiPageTranslationResponseFormat
    | typeof pageTranslationResponseFormat
} {
  const limit = completionTokenLimit(request)
  if (!limit) return {}
  const structured =
    request.action === "page_structure"
      ? { response_format: pageStructureResponseFormat }
      : request.action === "page_translation"
        ? {
            response_format:
              provider === "gemini"
                ? geminiPageTranslationResponseFormat
                : pageTranslationResponseFormat,
          }
        : {}
  const isHyMtTranslation = request.action === "page_translation" && isHyMtModel(model)
  if (provider === "openrouter")
    return {
      max_tokens: limit,
      ...(!isHyMtTranslation && model === "deepseek/deepseek-v4.1-flash"
        ? { reasoning: { effort: "low" as const, exclude: true } }
        : {}),
      ...(!isHyMtTranslation && usesReasoningEffort(model)
        ? { reasoning_effort: "low" as const }
        : {}),
      temperature: 0,
      ...(isHyMtTranslation ? {} : structured),
    }
  if (provider === "groq")
    return {
      max_completion_tokens: limit,
      reasoning_effort: "low",
      temperature: 0,
      ...structured,
    }
  if (provider === "gemini")
    if (request.action === "page_translation")
      return {
        max_completion_tokens: limit,
        response_format: geminiPageTranslationResponseFormat,
      }
  if (provider === "gemini")
    return {
      max_completion_tokens: limit,
      reasoning_effort:
        request.action === "translation" || request.action === "page_translation"
          ? "minimal"
          : "low",
      temperature: 0,
      ...structured,
    }
  return { max_completion_tokens: limit, ...structured }
}

export function routedModelForRequest(
  provider: ProviderConfig["provider"],
  model: string,
  request: AiRequest,
  pageTranslationModel?: string,
): string {
  if (provider === "openrouter" && request.action === "page_translation") {
    const configured = pageTranslationModel ?? OPENROUTER_PAGE_TRANSLATION_MODEL
    const requested = request.pageTranslationModel
    const choice = requested && isOpenRouterPageTranslationModel(requested) ? requested : configured
    if (choice !== PAGE_TRANSLATION_MAIN_MODEL) return choice
  }
  if (provider !== "openrouter" || model !== nitroBaseModel) return model
  if (completionTokenLimit(request) === undefined) return model
  return `${model}:nitro`
}
