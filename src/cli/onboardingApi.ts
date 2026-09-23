import { isCancel, note, password, select } from "@clack/prompts"
import type { LocalCredentialStore } from "../server/localCredentialStore"
import type { ProviderConfig } from "../shared/ipc"
import {
  DEFAULT_OPENROUTER_MODEL,
  GEMINI_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS,
  OPENAI_MODEL_OPTIONS,
  OPENROUTER_MODEL_OPTIONS,
  OPENROUTER_PAGE_TRANSLATION_MODEL,
} from "../shared/providerModels"

type ApiProvider = "openrouter" | "openai" | "gemini" | "groq"

const PROVIDER_OPTIONS: ReadonlyArray<{
  value: ApiProvider
  label: string
  hint: string
  models: readonly [string, ...string[]]
}> = [
  {
    value: "openrouter",
    label: "OpenRouter",
    hint: "여러 모델을 하나의 키로",
    models: OPENROUTER_MODEL_OPTIONS,
  },
  { value: "openai", label: "OpenAI", hint: "api.openai.com", models: OPENAI_MODEL_OPTIONS },
  { value: "gemini", label: "Gemini", hint: "Google AI", models: GEMINI_MODEL_OPTIONS },
  { value: "groq", label: "Groq", hint: "빠른 추론", models: GROQ_MODEL_OPTIONS },
]

export async function runApiKeyOnboarding(
  credentials: LocalCredentialStore,
): Promise<ProviderConfig | null> {
  const provider = await select({
    message: "API 프로바이더를 선택하세요",
    options: PROVIDER_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.hint,
    })),
  })
  if (isCancel(provider)) return null
  const selected = PROVIDER_OPTIONS.find((option) => option.value === provider)
  if (!selected) return null

  const apiKey = await password({
    message: `${selected.label} API 키`,
    validate: (value) =>
      (value ?? "").trim().length < 20 ? "API 키는 20자 이상이어야 합니다" : undefined,
  })
  if (isCancel(apiKey)) return null

  const model = await select({
    message: "모델을 선택하세요",
    options: selected.models.map((option) => ({ value: option, label: option })),
    initialValue: provider === "openrouter" ? DEFAULT_OPENROUTER_MODEL : selected.models[0],
  })
  if (isCancel(model)) return null

  const config: ProviderConfig =
    provider === "openrouter"
      ? {
          provider,
          apiKey,
          model,
          pageTranslationModel: OPENROUTER_PAGE_TRANSLATION_MODEL,
        }
      : { provider, apiKey, model }

  try {
    await credentials.saveApiConfig(config)
  } catch (error) {
    note(error instanceof Error ? error.message : "저장에 실패했습니다", "저장 실패")
    return null
  }
  return config
}
