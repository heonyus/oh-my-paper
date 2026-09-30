import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageSquareText,
  Sparkles,
} from "lucide-react"
import { type FormEvent, type JSX, useCallback, useEffect, useRef, useState } from "react"
import leafMarkUrl from "../../assets/branding/ohmypaper-leaf-mark.png"
import { useCodexSettings } from "../renderer/components/useCodexSettings"
import { CLAUDE_MODEL_OPTIONS, DEFAULT_CLAUDE_MODEL } from "../shared/claudeTypes"
import { CODEX_DEFAULT_MODEL, CODEX_MODEL_OPTIONS, defaultCodexModel } from "../shared/codexTypes"
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

type Step = "choose" | "claude" | "chatgpt" | "api" | "done"

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

const DEFAULT_CODEX_EFFORT = "medium"

/** "Claude Haiku 4.5 (기본)" → "Haiku 4.5", so the choice names the model it will use. */
const CLAUDE_DEFAULT_LABEL = (
  CLAUDE_MODEL_OPTIONS.find((option) => option.id === DEFAULT_CLAUDE_MODEL)?.label ??
  DEFAULT_CLAUDE_MODEL
)
  .replace(/^Claude /, "")
  .replace(/\s*\(.*\)$/, "")

const CODEX_DEFAULT_LABEL =
  CODEX_MODEL_OPTIONS.find((option) => option.id === CODEX_DEFAULT_MODEL)?.label ??
  CODEX_DEFAULT_MODEL

const CONNECTION_LABELS: Readonly<Record<NonNullable<ProviderStatus["mode"]>, string>> = {
  chatgpt: "ChatGPT 구독",
  claude: "Claude 구독",
  api: "API 키",
}

const FIRST_STEPS: ReadonlyArray<{ title: string; detail: string; keys?: readonly string[] }> = [
  { title: "PDF 가져오기", detail: "라이브러리에 끌어다 놓으면 페이지 구조를 먼저 분석합니다." },
  {
    title: "문장을 고르고 한 키로",
    detail: "번역, 설명, 노트에 담기. 카드는 원문 옆에 붙습니다.",
    keys: ["T", "E", "C"],
  },
  { title: "내 말로 남기기", detail: "노트에 쓰면 근거가 된 문단을 찾아 옆에 보여줍니다." },
]

/** A looping picture of the reader: a sentence lights up, its card and note appear beside it. */
function ReaderVignette(): JSX.Element {
  return (
    <div className="onboarding-vignette" aria-hidden="true">
      <div className="onboarding-page">
        <span className="onboarding-page-title">3.2 Scaled Dot-Product Attention</span>
        <span className="onboarding-page-line" style={{ width: "94%" }} />
        <span className="onboarding-page-line" style={{ width: "88%" }} />
        <span className="onboarding-page-sentence">
          Attention lets every token look at every other token in a single step.
        </span>
        <span className="onboarding-page-line" style={{ width: "91%" }} />
        <span className="onboarding-page-line" style={{ width: "72%" }} />
        <span className="onboarding-page-figure">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="onboarding-page-line" style={{ width: "86%" }} />
        <span className="onboarding-page-line" style={{ width: "64%" }} />
      </div>
      <div className="onboarding-card onboarding-card-translation">
        <small>번역</small>
        <p>어텐션은 모든 토큰이 한 번에 다른 모든 토큰을 보게 합니다.</p>
      </div>
      <div className="onboarding-card onboarding-card-note">
        <small>내 노트</small>
        <p>
          순서대로 읽지 않아도 된다 — 그래서 병렬화가 쉽다 <b>p.3</b>
        </p>
      </div>
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
        codexModel: CODEX_DEFAULT_MODEL,
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

function Choice({
  icon,
  title,
  badge,
  hint,
  onClick,
}: {
  readonly icon: JSX.Element
  readonly title: string
  readonly badge?: string | undefined
  readonly hint: string
  readonly onClick: () => void
}): JSX.Element {
  return (
    <button type="button" className="web-onboarding-choice" onClick={onClick}>
      <span className="web-onboarding-choice-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="web-onboarding-choice-text">
        <span className="web-onboarding-choice-title">
          {title}
          {badge ? <em>{badge}</em> : null}
        </span>
        <span className="web-onboarding-choice-hint">
          {hint.split(" · ").map((part, index) => (
            <span key={part}>
              {index > 0 ? " · " : null}
              {part}
            </span>
          ))}
        </span>
      </span>
      <ChevronRight size={16} className="web-onboarding-choice-chevron" aria-hidden="true" />
    </button>
  )
}

/**
 * The first-run page. Without AI it walks through connecting; when AI is already connected (the
 * terminal wizard did it) it opens on the ready step, so a fresh data folder still gets the intro.
 */
export function WebOnboarding({
  status,
  onDone,
}: {
  readonly status: ProviderStatus
  readonly onDone: (next: ProviderStatus) => void
}): JSX.Element {
  const [step, setStep] = useState<Step>(status.configured ? "done" : "choose")
  const [summary, setSummary] = useState(
    status.configured ? CONNECTION_LABELS[status.mode ?? "chatgpt"] : "",
  )
  const [doneStatus, setDoneStatus] = useState<ProviderStatus | null>(
    status.configured ? status : null,
  )
  const [chatgptError, setChatgptError] = useState("")
  const start = (): void => {
    if (doneStatus) onDone(doneStatus)
    else window.location.assign("/")
  }
  const loginStarted = useRef(false)

  const finish = useCallback(async (label: string): Promise<void> => {
    setDoneStatus(await window.ohmypaper.providerStatus())
    setSummary(label)
    setStep("done")
  }, [])

  /** A first connection starts on the newest model the runtime offers this account. */
  const connectChatgpt = useCallback(async (): Promise<void> => {
    // The settings hook reports every finished login, including failed or cancelled ones.
    if (!(await window.ohmypaper.codex.getStatus()).authenticated) return
    const models = await window.ohmypaper.codex.listModels().catch(() => [])
    await window.ohmypaper.saveAiMode({
      mode: "chatgpt",
      codexModel: defaultCodexModel(models),
      codexReasoningEffort: status.codexReasoningEffort ?? DEFAULT_CODEX_EFFORT,
    })
    await finish("ChatGPT 구독")
  }, [status, finish])

  const codex = useCodexSettings({ onConnectionChange: connectChatgpt })

  const beginChatgpt = (): void => {
    setChatgptError("")
    setStep("chatgpt")
  }

  useEffect(() => {
    if (step !== "chatgpt" || loginStarted.current || codex.status === null) return
    loginStarted.current = true
    if (codex.isConnected) {
      void connectChatgpt().catch((cause: unknown) =>
        setChatgptError(cause instanceof Error ? cause.message : "저장에 실패했습니다"),
      )
      return
    }
    void codex.startLogin("chatgpt").catch((cause: unknown) => {
      setChatgptError(cause instanceof Error ? cause.message : "로그인을 시작하지 못했습니다")
    })
  }, [step, codex, connectChatgpt])

  return (
    <main className="web-onboarding">
      <div className="web-onboarding-wash" aria-hidden="true" />
      <section className="web-onboarding-hero">
        <header className="web-onboarding-brand">
          <img src={leafMarkUrl} alt="" width={32} height={32} />
          <h1>oh-my-paper</h1>
        </header>
        <p className="web-onboarding-headline">
          PDF는 그대로,
          <br />
          번역·설명·노트는
          <br />
          <span>원문 자리에.</span>
        </p>
        <p className="web-onboarding-lede">
          문장을 고르고 한 키로 번역·설명·노트를 붙입니다. 문서는 이 컴퓨터 밖으로 나가지 않습니다.
        </p>
        <ReaderVignette />
      </section>

      <section className="web-onboarding-card" aria-live="polite">
        {step === "choose" ? (
          <div className="web-onboarding-step">
            <div className="web-onboarding-step-head">
              <span className="web-onboarding-eyebrow">시작하기</span>
              <h2>AI를 연결하세요</h2>
              <p className="web-onboarding-hint">
                가진 구독으로 바로 쓰거나, API 키를 넣으세요. 한 번이면 됩니다.
              </p>
            </div>
            <div className="web-onboarding-choices">
              <Choice
                icon={<MessageSquareText size={18} />}
                title="ChatGPT 구독"
                badge="API 키 불필요"
                hint={`ChatGPT 계정으로 로그인 · ${CODEX_DEFAULT_LABEL}`}
                onClick={beginChatgpt}
              />
              {window.ohmypaper.claude ? (
                <Choice
                  icon={<Sparkles size={18} />}
                  title="Claude 구독"
                  badge="API 키 불필요"
                  hint={`이 컴퓨터의 Claude Code 로그인 · ${CLAUDE_DEFAULT_LABEL}`}
                  onClick={() => setStep("claude")}
                />
              ) : null}
              <Choice
                icon={<KeyRound size={18} />}
                title="API 키"
                hint="OpenRouter · OpenAI · Gemini · Groq"
                onClick={() => setStep("api")}
              />
            </div>
            <p className="web-onboarding-foot">설정 › AI에서 언제든 바꿀 수 있습니다.</p>
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
                    onClick={() => {
                      void codex.cancelLogin()
                      loginStarted.current = false
                      setStep("choose")
                    }}
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
                      onClick={() => {
                        loginStarted.current = false
                        setStep("choose")
                      }}
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
            <span className="web-onboarding-done-mark" aria-hidden="true">
              <Check size={20} strokeWidth={2.6} />
            </span>
            <div className="web-onboarding-step-head">
              <h2>준비됐습니다</h2>
              <p className="web-onboarding-hint">
                {summary} 연결됨 — 이렇게 시작하세요. 시작하면 사용법 영상을 한 번 보여 드려요.
              </p>
            </div>
            <ol className="web-onboarding-tour">
              {FIRST_STEPS.map((item) => (
                <li key={item.title}>
                  <strong>
                    {item.title}
                    {item.keys ? (
                      <span className="web-onboarding-keys">
                        {item.keys.map((key) => (
                          <kbd key={key}>{key}</kbd>
                        ))}
                      </span>
                    ) : null}
                  </strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ol>
            <button type="button" className="web-onboarding-primary" onClick={start}>
              시작하기
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
