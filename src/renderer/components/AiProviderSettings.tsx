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
}: {
  readonly form: AiProviderFormState
  readonly onSave: (config: ProviderConfig) => Promise<void>
  readonly onModeSave?: (mode: AiMode) => Promise<void>
}): JSX.Element {
  const {
    mode,
    setMode,
    provider,
    setProvider,
    model,
    setModel,
    key,
    setKey,
    message,
    setMessage,
  } = form

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      if (mode === "api") {
        await onSave(
          provider === "opencodex" ? { provider, model } : { provider, model, apiKey: key },
        )
      }
      await onModeSave(mode)
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
            {provider !== "opencodex" ? (
              <label className="settings-row" htmlFor="provider-key">
                <span>API 키</span>
                <input
                  id="provider-key"
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder={provider === "groq" ? "gsk_…" : "API 키"}
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
          <button className="settings-save" type="submit">
            암호화하여 저장
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
  readonly key: string
  readonly setKey: Dispatch<SetStateAction<string>>
  readonly message: string
  readonly setMessage: Dispatch<SetStateAction<string>>
}

export function useAiProviderForm(status: ProviderStatus): AiProviderFormState {
  const [provider, setProvider] = useState<ProviderConfig["provider"]>(status.provider)
  const [mode, setMode] = useState<AiMode>(status.mode ?? "api")
  const [model, setModel] = useState(initialModel(status.provider, status.model))
  const [key, setKey] = useState("")
  const [message, setMessage] = useState("")
  return { mode, setMode, provider, setProvider, model, setModel, key, setKey, message, setMessage }
}
