import { X } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import type { ProviderConfig, ProviderStatus } from "../../shared/ipc"
import {
  DEFAULT_OPENROUTER_MODEL,
  isOpenRouterModel,
  OPENROUTER_MODEL_OPTIONS,
} from "../../shared/providerModels"

type SettingsModalProps = {
  readonly status: ProviderStatus
  readonly fontScale: number
  readonly onClose: () => void
  readonly onSave: (config: ProviderConfig) => Promise<void>
  readonly onFontScaleChange: (scale: number) => void
  readonly theme?: "system" | "light" | "dark" | undefined
  readonly onThemeChange?: ((theme: "system" | "light" | "dark") => void) | undefined
}

function initialModel(provider: ProviderConfig["provider"], model: string): string {
  if (provider !== "openrouter" || isOpenRouterModel(model)) {
    return model
  }
  return DEFAULT_OPENROUTER_MODEL
}

export function SettingsModal({
  status,
  fontScale,
  onClose,
  onSave,
  onFontScaleChange,
  theme = "system",
  onThemeChange,
}: SettingsModalProps): JSX.Element {
  const [provider, setProvider] = useState<ProviderConfig["provider"]>(status.provider)
  const [model, setModel] = useState(initialModel(status.provider, status.model))
  const [key, setKey] = useState("")
  const [message, setMessage] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await onSave(
        provider === "opencodex" ? { provider, model } : { provider, model, apiKey: key },
      )
      setKey("")
      setMessage("저장됨")
    } catch {
      setMessage("저장 실패")
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <h2 id="settings-title">AI 설정</h2>
          <button type="button" aria-label="설정 닫기" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <dl>
          <div>
            <dt>상태</dt>
            <dd>{status.configured ? "연결 준비됨" : "API 키 필요"}</dd>
          </div>
          <div>
            <dt>기본 모델</dt>
            <dd>{model}</dd>
          </div>
        </dl>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="ai-provider">Provider</label>
          <select
            id="ai-provider"
            value={provider}
            onChange={(event) => {
              const next = event.currentTarget.value
              if (next !== "openai" && next !== "openrouter" && next !== "opencodex") return
              setProvider(next)
              setModel(
                next === "openai"
                  ? "gpt-5"
                  : next === "opencodex"
                    ? "gpt-5.6-sol"
                    : DEFAULT_OPENROUTER_MODEL,
              )
            }}
          >
            <option value="openai">OpenAI API</option>
            <option value="openrouter">OpenRouter</option>
            <option value="opencodex">Local OpenCodex</option>
          </select>
          <label htmlFor="provider-model">모델 ID</label>
          {provider === "openrouter" ? (
            <select
              id="provider-model"
              value={model}
              onChange={(event) => setModel(event.currentTarget.value)}
            >
              {OPENROUTER_MODEL_OPTIONS.map((modelOption) => (
                <option key={modelOption} value={modelOption}>
                  {modelOption}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="provider-model"
              type="text"
              value={model}
              onChange={(event) => setModel(event.currentTarget.value)}
            />
          )}
          {provider === "opencodex" ? (
            <p className="settings-provider-note">
              실행 중인 로컬 OpenCodex(127.0.0.1:10100)에 연결합니다. 별도 키를 저장하지 않습니다.
            </p>
          ) : (
            <>
              <label htmlFor="provider-key">API 키</label>
              <input
                id="provider-key"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.currentTarget.value)}
                placeholder={provider === "openrouter" ? "sk-or-…" : "sk-…"}
              />
            </>
          )}
          <label htmlFor="ui-font-scale">글자 크기</label>
          <select
            id="ui-font-scale"
            value={fontScale}
            onChange={(event) => onFontScaleChange(Number(event.currentTarget.value))}
          >
            <option value={0.9}>작게 · 90%</option>
            <option value={1}>기본 · 100%</option>
            <option value={1.1}>크게 · 110%</option>
            <option value={1.2}>아주 크게 · 120%</option>
          </select>
          <label htmlFor="appearance-theme">화면 모드</label>
          <select
            id="appearance-theme"
            value={theme}
            onChange={(event) => {
              const next = event.currentTarget.value
              if (next === "system" || next === "light" || next === "dark") onThemeChange?.(next)
            }}
          >
            <option value="system">시스템 설정</option>
            <option value="light">라이트</option>
            <option value="dark">다크</option>
          </select>
          <button className="primary-action" type="submit">
            암호화하여 저장
          </button>
        </form>
        {message ? <p role="status">{message}</p> : null}
      </section>
    </div>
  )
}
