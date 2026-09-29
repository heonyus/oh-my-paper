import { ArrowLeft, CheckCircle2, ExternalLink, KeyRound, Loader2, Sparkles } from "lucide-react"
import { type FormEvent, type JSX, useCallback, useEffect, useRef, useState } from "react"
import leafMarkUrl from "../../assets/branding/ohmypaper-leaf-mark.png"
import sceneUrl from "../../assets/branding/ohmypaper-onboarding-golden-leaves-v1.jpg"
import { useCodexSettings } from "../renderer/components/useCodexSettings"
import type { ProviderConfig, ProviderStatus } from "../shared/ipc"
import {
  DEFAULT_OPENROUTER_MODEL,
  GEMINI_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS,
  OPENAI_MODEL_OPTIONS,
  OPENROUTER_MODEL_OPTIONS,
  OPENROUTER_PAGE_TRANSLATION_MODEL,
} from "../shared/providerModels"
import { ClaudeOnboardingStep } from "./ClaudeOnboardingStep"

type Step = "welcome" | "choose" | "claude" | "chatgpt" | "api" | "done"

const API_PROVIDERS: ReadonlyArray<{
  id: ProviderConfig["provider"]
  label: string
  models: readonly string[]
  keyPlaceholder: string
}> = [
  {
    id: "openrouter",
    label: "OpenRouter",
    models: OPENROUTER_MODEL_OPTIONS,
    keyPlaceholder: "sk-or-…",
  },
  { id: "openai", label: "OpenAI", models: OPENAI_MODEL_OPTIONS, keyPlaceholder: "sk-…" },
  { id: "gemini", label: "Gemini", models: GEMINI_MODEL_OPTIONS, keyPlaceholder: "AIza…" },
  { id: "groq", label: "Groq", models: GROQ_MODEL_OPTIONS, keyPlaceholder: "gsk_…" },
]

const DEFAULT_API_PROVIDER = API_PROVIDERS[0] ?? {
  id: "openrouter" as const,
  label: "OpenRouter",
  models: OPENROUTER_MODEL_OPTIONS,
  keyPlaceholder: "sk-or-…",
}

const DEFAULT_CODEX_MODEL = "gpt-5.6-sol"
const DEFAULT_CODEX_EFFORT = "medium"

function StepDots({ step }: { readonly step: Step }): JSX.Element {
  const index = step === "welcome" ? 0 : step === "done" ? 2 : 1
  return (
    <div className="web-onboarding-dots" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <i key={dot} data-active={dot <= index || undefined} />
      ))}
    </div>
  )
}

function ApiKeyStep({
  onBack,
  onConnected,
}: {
  readonly onBack: () => void
  readonly onConnected: () => Promise<void>
}): JSX.Element {
  const [provider, setProvider] = useState<(typeof API_PROVIDERS)[number]>(DEFAULT_API_PROVIDER)
  const [model, setModel] = useState<string>(DEFAULT_OPENROUTER_MODEL)
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  function chooseProvider(next: (typeof API_PROVIDERS)[number]): void {
    setProvider(next)
    setModel(next.models[0] ?? "")
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (key.trim().length < 20) {
      setError("API 키는 20자 이상이어야 합니다")
      return
    }
    setBusy(true)
    setError("")
    try {
      const config: ProviderConfig =
        provider.id === "openrouter"
          ? {
              provider: provider.id,
              apiKey: key.trim(),
              model,
              pageTranslationModel: OPENROUTER_PAGE_TRANSLATION_MODEL,
            }
          : { provider: provider.id, apiKey: key.trim(), model }
      await window.ohmypaper.saveProviderConfig(config)
      await window.ohmypaper.saveAiMode({
        mode: "api",
        codexModel: DEFAULT_CODEX_MODEL,
        codexReasoningEffort: DEFAULT_CODEX_EFFORT,
      })
      await onConnected()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장에 실패했습니다")
      setBusy(false)
    }
  }

  return (
    <form className="web-onboarding-step" onSubmit={(event) => void submit(event)}>
      <h2>API 키로 연결</h2>
      <p className="web-onboarding-hint">키는 이 컴퓨터의 로컬 저장소에만 보관됩니다.</p>
      <span className="web-onboarding-field-label">프로바이더</span>
      <div className="web-onboarding-chips">
        {API_PROVIDERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={provider.id === option.id}
            data-active={provider.id === option.id || undefined}
            onClick={() => chooseProvider(option)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="web-onboarding-field">
        <span>모델</span>
        <select value={model} onChange={(event) => setModel(event.currentTarget.value)}>
          {provider.models.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="web-onboarding-field">
        <span>{provider.label} API 키</span>
        <input
          type="password"
          autoComplete="off"
          value={key}
          placeholder={provider.keyPlaceholder}
          onChange={(event) => setKey(event.currentTarget.value)}
          disabled={busy}
        />
      </label>
      {error ? (
        <p className="web-onboarding-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="web-onboarding-actions">
        <button type="button" className="web-onboarding-ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft size={14} /> 뒤로
        </button>
        <button type="submit" className="web-onboarding-primary" disabled={busy}>
          {busy ? <Loader2 size={15} className="web-onboarding-spin" /> : <KeyRound size={15} />}
          {busy ? "연결하는 중…" : "연결하기"}
        </button>
      </div>
    </form>
  )
}

export function WebOnboarding({
  status,
  onDone,
}: {
  readonly status: ProviderStatus
  readonly onDone: (next: ProviderStatus) => void
}): JSX.Element {
  const [step, setStep] = useState<Step>("welcome")
  const [summary, setSummary] = useState("")
  const [doneStatus, setDoneStatus] = useState<ProviderStatus | null>(null)
  const [chatgptError, setChatgptError] = useState("")
  const loginStarted = useRef(false)

  const finish = useCallback(async (label: string): Promise<void> => {
    setDoneStatus(await window.ohmypaper.providerStatus())
    setSummary(label)
    setStep("done")
  }, [])

  const codex = useCodexSettings({
    onConnectionChange: async () => {
      await window.ohmypaper.saveAiMode({
        mode: "chatgpt",
        codexModel: status.codexModel ?? DEFAULT_CODEX_MODEL,
        codexReasoningEffort: status.codexReasoningEffort ?? DEFAULT_CODEX_EFFORT,
      })
      await finish("ChatGPT 구독")
    },
  })

  const beginChatgpt = (): void => {
    setChatgptError("")
    setStep("chatgpt")
  }

  useEffect(() => {
    if (step !== "chatgpt" || loginStarted.current || codex.status === null) return
    loginStarted.current = true
    if (codex.isConnected) {
      void window.ohmypaper
        .saveAiMode({
          mode: "chatgpt",
          codexModel: status.codexModel ?? DEFAULT_CODEX_MODEL,
          codexReasoningEffort: status.codexReasoningEffort ?? DEFAULT_CODEX_EFFORT,
        })
        .then(() => finish("ChatGPT 구독"))
        .catch((cause: unknown) =>
          setChatgptError(cause instanceof Error ? cause.message : "저장에 실패했습니다"),
        )
      return
    }
    void codex.startLogin("chatgpt").catch((cause: unknown) => {
      setChatgptError(cause instanceof Error ? cause.message : "로그인을 시작하지 못했습니다")
    })
  }, [step, codex, status, finish])

  return (
    <main className="web-onboarding">
      <div className="web-onboarding-scene" aria-hidden="true">
        <img src={sceneUrl} alt="" decoding="async" fetchPriority="high" />
      </div>
      <section className="web-onboarding-card" aria-live="polite">
        <header className="web-onboarding-brand">
          <img src={leafMarkUrl} alt="" width={44} height={44} />
          <div>
            <h1>oh-my-paper</h1>
            <p>번역·메모·인용을 원문 위치와 함께 정리합니다.</p>
          </div>
        </header>

        {step === "welcome" ? (
          <div className="web-onboarding-step">
            <h2>처음 한 번만 연결하면 바로 시작할 수 있습니다</h2>
            <ul className="web-onboarding-features">
              <li>원문 위치와 함께 보는 페이지 번역</li>
              <li>그림·표·수식을 곁들인 AI 설명</li>
              <li>메모·인용이 소스로 돌아가는 라이브러리</li>
            </ul>
            <button
              type="button"
              className="web-onboarding-primary"
              onClick={() => setStep("choose")}
            >
              시작하기
            </button>
          </div>
        ) : null}

        {step === "choose" ? (
          <div className="web-onboarding-step">
            <h2>AI 연결 방식을 선택하세요</h2>
            <div className="web-onboarding-choices">
              {window.ohmypaper.claude ? (
                <button
                  type="button"
                  className="web-onboarding-choice"
                  onClick={() => setStep("claude")}
                >
                  <span className="web-onboarding-choice-title">
                    <Sparkles size={15} aria-hidden="true" /> Claude 구독
                    <em>권장</em>
                  </span>
                  <span className="web-onboarding-choice-hint">
                    이 컴퓨터의 Claude Code 로그인으로 · 기본 모델 Haiku 4.5
                  </span>
                </button>
              ) : null}
              <button type="button" className="web-onboarding-choice" onClick={beginChatgpt}>
                <span className="web-onboarding-choice-title">
                  <Sparkles size={15} aria-hidden="true" /> ChatGPT 구독
                  {window.ohmypaper.claude ? null : <em>권장</em>}
                </span>
                <span className="web-onboarding-choice-hint">
                  API 키 없이 내 구독 사용량으로 바로 시작
                </span>
              </button>
              <button
                type="button"
                className="web-onboarding-choice"
                onClick={() => setStep("api")}
              >
                <span className="web-onboarding-choice-title">
                  <KeyRound size={15} aria-hidden="true" /> API 키
                </span>
                <span className="web-onboarding-choice-hint">
                  OpenRouter · OpenAI · Gemini · Groq
                </span>
              </button>
            </div>
            <p className="web-onboarding-hint">나중에 앱 설정에서 언제든 변경할 수 있습니다.</p>
          </div>
        ) : null}

        {step === "chatgpt" ? (
          <div className="web-onboarding-step">
            <h2>ChatGPT 구독 연결</h2>
            {codex.pendingLogin ? (
              <div className="web-onboarding-pending" role="status">
                <Loader2 size={16} className="web-onboarding-spin" />
                <p>
                  {codex.pendingLogin.userCode
                    ? `열린 페이지에서 코드 ${codex.pendingLogin.userCode} 를 입력하세요`
                    : "열린 브라우저에서 ChatGPT 승인을 완료하세요"}
                </p>
                <div className="web-onboarding-actions">
                  <a
                    className="web-onboarding-ghost"
                    href={codex.pendingLogin.authUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} /> 로그인 페이지
                  </a>
                  {!codex.pendingLogin.userCode ? (
                    <button
                      type="button"
                      className="web-onboarding-ghost"
                      onClick={() => void codex.startLogin("chatgptDeviceCode")}
                    >
                      기기 코드로 전환
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="web-onboarding-ghost"
                    onClick={() => void codex.cancelLogin()}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="web-onboarding-pending" role="status">
                <Loader2 size={16} className="web-onboarding-spin" />
                <p>
                  {codex.status === null
                    ? "로그인 런타임을 확인하는 중…"
                    : chatgptError || codex.message || "로그인을 준비하는 중…"}
                </p>
                {chatgptError || codex.message ? (
                  <div className="web-onboarding-actions">
                    <button
                      type="button"
                      className="web-onboarding-ghost"
                      onClick={() => setStep("choose")}
                    >
                      <ArrowLeft size={14} /> 뒤로
                    </button>
                    <button
                      type="button"
                      className="web-onboarding-primary"
                      onClick={() => {
                        loginStarted.current = false
                        setChatgptError("")
                        void codex.refresh()
                      }}
                    >
                      다시 시도
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {step === "claude" ? (
          <ClaudeOnboardingStep
            onBack={() => setStep("choose")}
            onConnected={() => finish("Claude 구독")}
          />
        ) : null}

        {step === "api" ? (
          <ApiKeyStep onBack={() => setStep("choose")} onConnected={() => finish("API 키")} />
        ) : null}

        {step === "done" ? (
          <div className="web-onboarding-step web-onboarding-done">
            <CheckCircle2 size={34} aria-hidden="true" />
            <h2>준비가 끝났습니다</h2>
            <p className="web-onboarding-hint">{summary} 연결됨 — PDF를 열어 시작하세요.</p>
            <button
              type="button"
              className="web-onboarding-primary"
              onClick={() => (doneStatus ? onDone(doneStatus) : window.location.assign("/"))}
            >
              라이브러리 열기
            </button>
          </div>
        ) : null}

        <StepDots step={step} />
      </section>
    </main>
  )
}
