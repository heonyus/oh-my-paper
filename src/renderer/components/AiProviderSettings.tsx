import { Check } from "lucide-react"
import { type Dispatch, type FormEvent, type JSX, type SetStateAction, useState } from "react"
import type { ProviderConfig, ProviderStatus } from "../../shared/ipc"
import type { AiMode } from "../../shared/providerModels"
import {
  DEFAULT_OPENROUTER_MODEL,
  GEMINI_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS,
  isOpenRouterModel,
  OPENAI_MODEL_OPTIONS,
  OPENCODEX_MODEL_OPTIONS,
  OPENROUTER_MODEL_OPTIONS,
  OPENROUTER_PAGE_TRANSLATION_MODEL,
  OPENROUTER_PAGE_TRANSLATION_OPTIONS,
  PAGE_TRANSLATION_MAIN_MODEL,
} from "../../shared/providerModels"

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
    case "opencodex":
      return OPENCODEX_MODEL_OPTIONS
  }
}

function initialModel(provider: ProviderConfig["provider"], model: string): string {
  return provider !== "openrouter" || isOpenRouterModel(model) ? model : DEFAULT_OPENROUTER_MODEL
}

function nextProviderModel(provider: ProviderConfig["provider"]): string {
  switch (provider) {
    case "openai":
      return "gpt-5"
    case "openrouter":
      return DEFAULT_OPENROUTER_MODEL
    case "opencodex":
      return "gpt-5.6-sol"
    case "gemini":
      return "gemini-3.5-flash-lite"
    case "groq":
      return "openai/gpt-oss-20b"
  }
}

export function AiProviderSettings({
  form,
  onSave,
  onModeSave = async () => {},
  openRouterOnly = false,
}: {
  readonly form: AiProviderFormState
  readonly onSave: (config: ProviderConfig) => Promise<void>
  readonly onModeSave?: (mode: AiMode) => Promise<void>
  readonly openRouterOnly?: boolean | undefined
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

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      if (mode === "api") {
        await onSave(
          provider === "openrouter"
            ? { provider, model, apiKey: key, pageTranslationModel }
            : provider === "opencodex"
              ? { provider, model }
              : { provider, model, apiKey: key },
        )
      }
      if (!openRouterOnly) await onModeSave(mode)
      setKey("")
      setMessage("저장됨")
    } catch (error) {
      if (!(error instanceof Error)) throw error
      setMessage("저장 실패")
    }
  }

  return (
    <form className="settings-ai-form" onSubmit={(event) => void submit(event)}>
      <div className="settings-group">
        {!openRouterOnly ? (
          <label className="settings-row" htmlFor="ai-mode">
            <span>AI 접근 방식</span>
            <select
              id="ai-mode"
              value={mode}
              onChange={(event) => {
                const next = event.currentTarget.value
                if (next === "api" || next === "chatgpt") {
                  setMode(next)
                  void onModeSave(next)
                }
              }}
            >
              <option value="chatgpt">ChatGPT 구독</option>
              <option value="api">API 키·로컬 연결 (고급)</option>
            </select>
          </label>
        ) : null}
        {mode === "api" ? (
          <>
            {!openRouterOnly ? (
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
                      next !== "opencodex" &&
                      next !== "gemini" &&
                      next !== "groq"
                    )
                      return
                    setProvider(next)
                    setModel(nextProviderModel(next))
                  }}
                >
                  <option value="gemini">Gemini API</option>
                  <option value="groq">Groq</option>
                  <option value="openai">OpenAI API</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="opencodex">로컬 OpenAI 호환 프록시</option>
                </select>
              </label>
            ) : null}
            <label className="settings-row" htmlFor="provider-model">
              <span>모델</span>
              <select
                id="provider-model"
                aria-label="모델 ID"
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
                <span>페이지 번역</span>
                <select
                  id="page-translation-model"
                  aria-label="페이지 번역 모델"
                  value={pageTranslationModel}
                  onChange={(event) => setPageTranslationModel(event.currentTarget.value)}
                >
                  <option value={PAGE_TRANSLATION_MAIN_MODEL}>메인 모델 사용</option>
                  {OPENROUTER_PAGE_TRANSLATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {provider !== "opencodex" ? (
              <label className="settings-row" htmlFor="provider-key">
                <span>
                  {openRouterOnly ? "OpenRouter API 키" : "API 키"}
                  {keyConfigured ? (
                    <small className="settings-key-status">
                      <Check size={12} aria-hidden /> 저장된 키 사용 중
                    </small>
                  ) : null}
                </span>
                <input
                  id="provider-key"
                  aria-label={openRouterOnly ? "OpenRouter API 키" : "API 키"}
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder={
                    keyConfigured
                      ? "변경하려면 새 키 입력"
                      : provider === "groq"
                        ? "gsk_…"
                        : "API 키"
                  }
                  onChange={(event) => setKey(event.currentTarget.value)}
                />
              </label>
            ) : null}
          </>
        ) : (
          <div className="settings-row">
            <span className="settings-help">
              아래에서 ChatGPT로 로그인하세요. 별도 API 키는 필요하지 않습니다.
            </span>
          </div>
        )}
      </div>
      {mode === "api" ? (
        <div className="settings-form-footer">
          {message ? (
            <span role="status">
              <Check size={13} /> {message}
            </span>
          ) : (
            <span />
          )}
          <button
            className="settings-save"
            type="submit"
            disabled={openRouterOnly && key.trim().length < 20}
          >
            {openRouterOnly ? "OpenRouter 설정 저장" : "암호화하여 저장"}
          </button>
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
): AiProviderFormState {
  const initialProvider = openRouterOnly ? "openrouter" : status.provider
  const [provider, setProvider] = useState<ProviderConfig["provider"]>(initialProvider)
  const [mode, setMode] = useState<AiMode>(openRouterOnly ? "api" : (status.mode ?? "api"))
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
