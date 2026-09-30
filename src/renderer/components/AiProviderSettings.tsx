import { Check } from "lucide-react"
import { type Dispatch, type FormEvent, type JSX, type SetStateAction, useState } from "react"
import { LOCALES } from "../../shared/i18n/locale"
import type { ProviderConfig, ProviderStatus } from "../../shared/ipc"
import type { AiMode } from "../../shared/providerModels"
import {
  DEFAULT_OPENROUTER_MODEL,
  GEMINI_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS,
  isOpenRouterModel,
  OPENAI_MODEL_OPTIONS,
  OPENROUTER_MODEL_OPTIONS,
  OPENROUTER_PAGE_TRANSLATION_MODEL,
  OPENROUTER_PAGE_TRANSLATION_OPTIONS,
  PAGE_TRANSLATION_MAIN_MODEL,
} from "../../shared/providerModels"
import { useTranslator } from "../lib/locale"
import { settingsMessages } from "../messages/settings"

/** A failed save, in whichever language it was reported before the reader switched. */
function isSaveFailure(message: string): boolean {
  return LOCALES.some((locale) =>
    message.startsWith(settingsMessages[locale]["settings.ai.saveFailed"]),
  )
}

function providerModelOptions(provider: ProviderConfig["provider"]): readonly string[] {
  switch (provider) {
    case "openai":
      return OPENAI_MODEL_OPTIONS
    case "gemini":
      return GEMINI_MODEL_OPTIONS
    case "openrouter":
      return OPENROUTER_MODEL_OPTIONS
    case "groq":
      return GROQ_MODEL_OPTIONS
  }
}

function initialModel(provider: ProviderConfig["provider"], model: string): string {
  return provider !== "openrouter" || isOpenRouterModel(model) ? model : DEFAULT_OPENROUTER_MODEL
}

function nextProviderModel(provider: ProviderConfig["provider"]): string {
  switch (provider) {
    case "openrouter":
      return DEFAULT_OPENROUTER_MODEL
    default:
      return providerModelOptions(provider)[0] ?? ""
  }
}

export function AiProviderSettings({
  form,
  onSave,
  onModeSave = async () => {},
  openRouterOnly = false,
  hideChatgptMode = false,
  claudeAvailable = false,
}: {
  readonly form: AiProviderFormState
  readonly onSave: (config: ProviderConfig) => Promise<void>
  readonly onModeSave?: (mode: AiMode) => Promise<void>
  readonly openRouterOnly?: boolean | undefined
  readonly hideChatgptMode?: boolean | undefined
  readonly claudeAvailable?: boolean | undefined
}): JSX.Element {
  const {
    mode,
    setMode,
    provider,
    setProvider,
    model,
    setModel,
    pageTranslationModel,
    setPageTranslationModel,
    key,
    setKey,
    keyConfigured,
    message,
    setMessage,
  } = form
  const t = useTranslator(settingsMessages)
  const [saving, setSaving] = useState(false)
  const saveFailed = (error: unknown): string =>
    `${t("settings.ai.saveFailed")}: ${errorMessage(error, t("settings.ai.saveError"))}`

  async function saveMode(nextMode: AiMode, previousMode: AiMode): Promise<void> {
    setSaving(true)
    setMessage("")
    setMode(nextMode)
    try {
      await onModeSave(nextMode)
      setMessage(t("settings.ai.saved"))
    } catch (error) {
      setMode(previousMode)
      setMessage(saveFailed(error))
    } finally {
      setSaving(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    try {
      if (mode === "api") {
        await onSave(
          provider === "openrouter"
            ? { provider, model, apiKey: key, pageTranslationModel }
            : { provider, model, apiKey: key },
        )
      }
      if (!hideChatgptMode) await onModeSave(mode)
      setKey("")
      setMessage(t("settings.ai.saved"))
    } catch (error) {
      setMessage(saveFailed(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="settings-ai-form" onSubmit={(event) => void submit(event)}>
      <div className="settings-group">
        {!hideChatgptMode ? (
          <label className="settings-row" htmlFor="ai-mode">
            <span>{t("settings.ai.mode")}</span>
            <select
              id="ai-mode"
              value={mode}
              onChange={(event) => {
                const next = event.currentTarget.value
                if (
                  next === "api" ||
                  next === "chatgpt" ||
                  (next === "claude" && claudeAvailable)
                ) {
                  void saveMode(next, mode)
                }
              }}
              disabled={saving}
            >
              {claudeAvailable ? (
                <option value="claude">{t("settings.ai.mode.claude")}</option>
              ) : null}
              <option value="chatgpt">{t("settings.ai.mode.chatgpt")}</option>
              <option value="api">{t("settings.ai.mode.api")}</option>
            </select>
          </label>
        ) : null}
        {mode === "api" ? (
          <>
            <label className="settings-row" htmlFor="ai-provider">
              <span>Provider</span>
              <select
                id="ai-provider"
                value={provider}
                onChange={(event) => {
                  const next = event.currentTarget.value
                  if (
                    next !== "openai" &&
                    next !== "openrouter" &&
                    next !== "gemini" &&
                    next !== "groq"
                  )
                    return
                  if (openRouterOnly && next !== "openrouter") return
                  setProvider(next)
                  setModel(nextProviderModel(next))
                }}
              >
                {!openRouterOnly ? (
                  <>
                    <option value="gemini">Gemini API</option>
                    <option value="groq">Groq</option>
                    <option value="openai">OpenAI API</option>
                  </>
                ) : null}
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <label className="settings-row" htmlFor="provider-model">
              <span>{t("settings.ai.model")}</span>
              <select
                id="provider-model"
                aria-label={t("settings.ai.modelId")}
                value={model}
                onChange={(event) => setModel(event.currentTarget.value)}
              >
                {providerModelOptions(provider).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {provider === "openrouter" ? (
              <label className="settings-row" htmlFor="page-translation-model">
                <span>{t("settings.ai.pageTranslation")}</span>
                <select
                  id="page-translation-model"
                  aria-label={t("settings.ai.pageTranslationModel")}
                  value={pageTranslationModel}
                  onChange={(event) => setPageTranslationModel(event.currentTarget.value)}
                >
                  <option value={PAGE_TRANSLATION_MAIN_MODEL}>
                    {t("settings.ai.useMainModel")}
                  </option>
                  {OPENROUTER_PAGE_TRANSLATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="settings-row" htmlFor="provider-key">
              <span>
                {openRouterOnly ? t("settings.ai.openRouterKey") : t("settings.ai.apiKey")}
                {keyConfigured ? (
                  <small className="settings-key-status">
                    <Check size={12} aria-hidden /> {t("settings.ai.savedKey")}
                  </small>
                ) : null}
              </span>
              <input
                id="provider-key"
                aria-label={
                  openRouterOnly ? t("settings.ai.openRouterKey") : t("settings.ai.apiKey")
                }
                type="password"
                autoComplete="off"
                value={key}
                placeholder={
                  keyConfigured
                    ? t("settings.ai.newKeyPlaceholder")
                    : provider === "groq"
                      ? "gsk_…"
                      : t("settings.ai.apiKey")
                }
                onChange={(event) => setKey(event.currentTarget.value)}
                disabled={saving}
              />
            </label>
          </>
        ) : (
          <div className="settings-row">
            <span className="settings-help">
              {mode === "claude" ? t("settings.ai.claudeHelp") : t("settings.ai.chatgptHelp")}
            </span>
          </div>
        )}
      </div>
      {mode === "api" || message ? (
        <div className="settings-form-footer">
          {message ? (
            <span role="status" data-error={isSaveFailure(message) || undefined}>
              {isSaveFailure(message) ? null : <Check size={13} />} {message}
            </span>
          ) : (
            <span />
          )}
          {mode === "api" ? (
            <button
              className="settings-save"
              type="submit"
              disabled={saving || (openRouterOnly && key.trim().length < 20)}
            >
              {openRouterOnly ? t("settings.ai.saveOpenRouter") : t("settings.ai.saveEncrypted")}
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

export type AiProviderFormState = {
  readonly mode: AiMode
  readonly setMode: Dispatch<SetStateAction<AiMode>>
  readonly provider: ProviderConfig["provider"]
  readonly setProvider: Dispatch<SetStateAction<ProviderConfig["provider"]>>
  readonly model: string
  readonly setModel: Dispatch<SetStateAction<string>>
  readonly pageTranslationModel: string
  readonly setPageTranslationModel: Dispatch<SetStateAction<string>>
  readonly key: string
  readonly setKey: Dispatch<SetStateAction<string>>
  readonly keyConfigured: boolean
  readonly message: string
  readonly setMessage: Dispatch<SetStateAction<string>>
}

export function useAiProviderForm(
  status: ProviderStatus,
  openRouterOnly = false,
  hideChatgptMode = false,
): AiProviderFormState {
  const initialProvider =
    openRouterOnly || status.provider === "opencodex" || status.provider === "anthropic"
      ? "openrouter"
      : status.provider
  const [provider, setProvider] = useState<ProviderConfig["provider"]>(initialProvider)
  const [mode, setMode] = useState<AiMode>(hideChatgptMode ? "api" : (status.mode ?? "api"))
  const [model, setModel] = useState(initialModel(initialProvider, status.model))
  const [pageTranslationModel, setPageTranslationModel] = useState(
    status.pageTranslationModel ?? OPENROUTER_PAGE_TRANSLATION_MODEL,
  )
  const [key, setKey] = useState("")
  const [message, setMessage] = useState("")
  return {
    mode,
    setMode,
    provider,
    setProvider,
    model,
    setModel,
    pageTranslationModel,
    setPageTranslationModel,
    key,
    setKey,
    keyConfigured: status.configured && provider === status.provider,
    message,
    setMessage,
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}
