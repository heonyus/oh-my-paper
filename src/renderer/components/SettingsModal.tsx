import { BookOpen, Bot, Check, SlidersHorizontal, X } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import type { ProviderConfig, ProviderStatus } from "../../shared/ipc"
import {
  DEFAULT_OPENROUTER_MODEL,
  isOpenRouterModel,
  OPENROUTER_MODEL_OPTIONS,
} from "../../shared/providerModels"

type SettingsSection = "general" | "ai" | "reading"
type AppearanceTheme = "system" | "light" | "dark"

type SettingsModalProps = {
  readonly status: ProviderStatus
  readonly fontScale: number
  readonly minimapVisible?: boolean | undefined
  readonly onClose: () => void
  readonly onSave: (config: ProviderConfig) => Promise<void>
  readonly onFontScaleChange: (scale: number) => void
  readonly onMinimapVisibleChange?: ((visible: boolean) => void) | undefined
  readonly theme?: AppearanceTheme | undefined
  readonly onThemeChange?: ((theme: AppearanceTheme) => void) | undefined
}

const sections = [
  { id: "general", label: "일반", icon: SlidersHorizontal },
  { id: "ai", label: "AI 모델", icon: Bot },
  { id: "reading", label: "읽기", icon: BookOpen },
] as const

function initialModel(provider: ProviderConfig["provider"], model: string): string {
  return provider !== "openrouter" || isOpenRouterModel(model) ? model : DEFAULT_OPENROUTER_MODEL
}

function nextProviderModel(provider: ProviderConfig["provider"]): string {
  if (provider === "openai") return "gpt-5"
  if (provider === "opencodex") return "gpt-5.6-sol"
  return DEFAULT_OPENROUTER_MODEL
}

export function SettingsModal({
  status,
  fontScale,
  minimapVisible = true,
  onClose,
  onSave,
  onFontScaleChange,
  onMinimapVisibleChange,
  theme = "system",
  onThemeChange,
}: SettingsModalProps): JSX.Element {
  const [section, setSection] = useState<SettingsSection>("ai")
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
    <div className="modal-backdrop settings-backdrop" role="presentation">
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <aside className="settings-source-list" aria-label="설정 섹션">
          <h2 id="settings-title">설정</h2>
          <nav>
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className="settings-nav-item"
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="settings-content">
          <header className="settings-content-head">
            <div>
              <h3>{sections.find((item) => item.id === section)?.label}</h3>
              {section === "ai" ? (
                <span className="settings-connection" data-ready={status.configured}>
                  <i /> {status.configured ? "연결 준비됨" : "설정 필요"}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="settings-close"
              aria-label="설정 닫기"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </header>
          <div className="settings-page">
            {section === "general" ? (
              <fieldset className="settings-group">
                <legend>일반 환경설정</legend>
                <label className="settings-row" htmlFor="appearance-theme">
                  <span>화면 모드</span>
                  <select
                    id="appearance-theme"
                    value={theme}
                    onChange={(event) => {
                      const next = event.currentTarget.value
                      if (next === "system" || next === "light" || next === "dark")
                        onThemeChange?.(next)
                    }}
                  >
                    <option value="system">시스템 설정</option>
                    <option value="light">라이트</option>
                    <option value="dark">다크</option>
                  </select>
                </label>
                <label className="settings-row" htmlFor="ui-font-scale">
                  <span>글자 크기</span>
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
                </label>
              </fieldset>
            ) : null}
            {section === "ai" ? (
              <form className="settings-ai-form" onSubmit={(event) => void submit(event)}>
                <div className="settings-group">
                  <label className="settings-row" htmlFor="ai-provider">
                    <span>Provider</span>
                    <select
                      id="ai-provider"
                      value={provider}
                      onChange={(event) => {
                        const next = event.currentTarget.value
                        if (next !== "openai" && next !== "openrouter" && next !== "opencodex")
                          return
                        setProvider(next)
                        setModel(nextProviderModel(next))
                      }}
                    >
                      <option value="openai">OpenAI API</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="opencodex">Local OpenCodex</option>
                    </select>
                  </label>
                  <label className="settings-row" htmlFor="provider-model">
                    <span>모델</span>
                    {provider === "openrouter" ? (
                      <select
                        id="provider-model"
                        aria-label="모델 ID"
                        value={model}
                        onChange={(event) => setModel(event.currentTarget.value)}
                      >
                        {OPENROUTER_MODEL_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="provider-model"
                        aria-label="모델 ID"
                        value={model}
                        onChange={(event) => setModel(event.currentTarget.value)}
                      />
                    )}
                  </label>
                  {provider !== "opencodex" ? (
                    <label className="settings-row" htmlFor="provider-key">
                      <span>API 키</span>
                      <input
                        id="provider-key"
                        type="password"
                        autoComplete="off"
                        value={key}
                        placeholder={provider === "openrouter" ? "sk-or-…" : "sk-…"}
                        onChange={(event) => setKey(event.currentTarget.value)}
                      />
                    </label>
                  ) : null}
                </div>
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
              </form>
            ) : null}
            {section === "reading" ? (
              <fieldset className="settings-group">
                <legend>읽기 환경설정</legend>
                <label className="settings-row settings-toggle-row">
                  <span>
                    <strong>미니맵 표시</strong>
                    <small>긴 논문과 카드 위치를 한눈에 봅니다.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="settings-switch"
                    aria-label="미니맵 표시"
                    checked={minimapVisible}
                    onChange={(event) => onMinimapVisibleChange?.(event.currentTarget.checked)}
                  />
                </label>
              </fieldset>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
