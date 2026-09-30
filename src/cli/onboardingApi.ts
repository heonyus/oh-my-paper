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
import { t } from "./messages"

/** Hints that are catalog keys; the rest (host names, brands) show as written. */
type ApiHint = "api.openrouterHint" | "api.groqHint"

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
    hint: "api.openrouterHint",
    models: OPENROUTER_MODEL_OPTIONS,
  },
  { value: "openai", label: "OpenAI", hint: "api.openai.com", models: OPENAI_MODEL_OPTIONS },
  { value: "gemini", label: "Gemini", hint: "Google AI", models: GEMINI_MODEL_OPTIONS },
  { value: "groq", label: "Groq", hint: "api.groqHint", models: GROQ_MODEL_OPTIONS },
]

export async function runApiKeyOnboarding(
  credentials: LocalCredentialStore,
): Promise<ProviderConfig | null> {
  const provider = await select({
    message: t("api.pickProvider"),
    options: PROVIDER_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.hint.startsWith("api.") ? t(option.hint as ApiHint) : option.hint,
    })),
  })
  if (isCancel(provider)) return null
  const selected = PROVIDER_OPTIONS.find((option) => option.value === provider)
  if (!selected) return null

  const apiKey = await password({
    message: t("api.keyPrompt", { provider: selected.label }),
    validate: (value) => ((value ?? "").trim().length < 20 ? t("api.keyTooShort") : undefined),
  })
  if (isCancel(apiKey)) return null

  const model = await select({
    message: t("api.pickModel"),
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
    note(error instanceof Error ? error.message : t("api.saveFailed"), t("api.saveFailedTitle"))
    return null
  }
  return config
}
