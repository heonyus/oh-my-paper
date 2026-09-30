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
import { useTranslator } from "../renderer/lib/locale"
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
import { type WebMessageKey, webMessages } from "./messages"

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

const CONNECTION_LABELS: Readonly<Record<NonNullable<ProviderStatus["mode"]>, WebMessageKey>> = {
  chatgpt: "onb.chatgpt",
  claude: "onb.claude",
  api: "onb.api",
}

const FIRST_STEPS: ReadonlyArray<{
  title: WebMessageKey
  detail: WebMessageKey
  keys?: readonly string[]
}> = [
  { title: "onb.step1.title", detail: "onb.step1.detail" },
  { title: "onb.step2.title", detail: "onb.step2.detail", keys: ["T", "E", "C"] },
  { title: "onb.step3.title", detail: "onb.step3.detail" },
]

/** A looping picture of the reader: a sentence lights up, its card and note appear beside it. */
function ReaderVignette(): JSX.Element {
  const t = useTranslator(webMessages)
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
        <small>{t("onb.vignette.cardLabel")}</small>
        <p>{t("onb.vignette.cardText")}</p>
      </div>
      <div className="onboarding-card onboarding-card-note">
        <small>{t("onb.vignette.noteLabel")}</small>
        <p>
          {t("onb.vignette.noteText")} <b>p.3</b>
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
  const t = useTranslator(webMessages)
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
      setError(t("onb.api.keyTooShort"))
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
      setError(cause instanceof Error ? cause.message : t("onb.saveFailed"))
      setBusy(false)
    }
  }

  return (
    <form className="web-onboarding-step" onSubmit={(event) => void submit(event)}>
      <h2>{t("onb.api.title")}</h2>
      <p className="web-onboarding-hint">{t("onb.api.hint")}</p>
      <span className="web-onboarding-field-label">{t("onb.api.provider")}</span>
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
        <span>{t("onb.api.model")}</span>
        <select value={model} onChange={(event) => setModel(event.currentTarget.value)}>
          {provider.models.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="web-onboarding-field">
        <span>{t("onb.api.keyLabel", { provider: provider.label })}</span>
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
          <ArrowLeft size={14} /> {t("onb.back")}
        </button>
        <button type="submit" className="web-onboarding-primary" disabled={busy}>
          {busy ? <Loader2 size={15} className="web-onboarding-spin" /> : <KeyRound size={15} />}
          {busy ? t("onb.connecting") : t("onb.connect")}
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
  const t = useTranslator(webMessages)
  const [step, setStep] = useState<Step>(status.configured ? "done" : "choose")
  const [summary, setSummary] = useState<WebMessageKey>(CONNECTION_LABELS[status.mode ?? "chatgpt"])
  const [doneStatus, setDoneStatus] = useState<ProviderStatus | null>(
    status.configured ? status : null,
  )
  const [chatgptError, setChatgptError] = useState("")
  const start = (): void => {
    if (doneStatus) onDone(doneStatus)
    else window.location.assign("/")
  }
  const loginStarted = useRef(false)

  const finish = useCallback(async (label: WebMessageKey): Promise<void> => {
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
    await finish("onb.chatgpt")
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
        setChatgptError(cause instanceof Error ? cause.message : t("onb.saveFailed")),
      )
      return
    }
    void codex.startLogin("chatgpt").catch((cause: unknown) => {
      setChatgptError(cause instanceof Error ? cause.message : t("onb.startFailed"))
    })
  }, [step, codex, connectChatgpt, t])

  return (
    <main className="web-onboarding">
      <div className="web-onboarding-wash" aria-hidden="true" />
      <section className="web-onboarding-hero">
        <header className="web-onboarding-brand">
          <img src={leafMarkUrl} alt="" width={32} height={32} />
          <h1>oh-my-paper</h1>
        </header>
        <p className="web-onboarding-headline">
          {t("onb.headline1")}
          <br />
          {t("onb.headline2")}
          <br />
          <span>{t("onb.headline3")}</span>
        </p>
        <p className="web-onboarding-lede">{t("onb.lede")}</p>
        <ReaderVignette />
      </section>

      <section className="web-onboarding-card" aria-live="polite">
        {step === "choose" ? (
          <div className="web-onboarding-step">
            <div className="web-onboarding-step-head">
              <span className="web-onboarding-eyebrow">{t("onb.eyebrow")}</span>
              <h2>{t("onb.chooseTitle")}</h2>
              <p className="web-onboarding-hint">{t("onb.chooseHint")}</p>
            </div>
            <div className="web-onboarding-choices">
              <Choice
                icon={<MessageSquareText size={18} />}
                title={t("onb.chatgpt")}
                badge={t("onb.noApiKey")}
                hint={t("onb.chatgptHint", { model: CODEX_DEFAULT_LABEL })}
                onClick={beginChatgpt}
              />
              {window.ohmypaper.claude ? (
                <Choice
                  icon={<Sparkles size={18} />}
                  title={t("onb.claude")}
                  badge={t("onb.noApiKey")}
                  hint={t("onb.claudeHint", { model: CLAUDE_DEFAULT_LABEL })}
                  onClick={() => setStep("claude")}
                />
              ) : null}
              <Choice
                icon={<KeyRound size={18} />}
                title={t("onb.api")}
                hint="OpenRouter · OpenAI · Gemini · Groq"
                onClick={() => setStep("api")}
              />
            </div>
            <p className="web-onboarding-foot">{t("onb.foot")}</p>
          </div>
        ) : null}

        {step === "chatgpt" ? (
          <div className="web-onboarding-step">
            <h2>{t("onb.chatgpt.title")}</h2>
            {codex.pendingLogin ? (
              <div className="web-onboarding-pending" role="status">
                <Loader2 size={16} className="web-onboarding-spin" />
                <p>
                  {codex.pendingLogin.userCode
                    ? t("onb.chatgpt.enterCode", { code: codex.pendingLogin.userCode })
                    : t("onb.chatgpt.approve")}
                </p>
                <div className="web-onboarding-actions">
                  <a
                    className="web-onboarding-ghost"
                    href={codex.pendingLogin.authUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} /> {t("onb.signInPage")}
                  </a>
                  {!codex.pendingLogin.userCode ? (
                    <button
                      type="button"
                      className="web-onboarding-ghost"
                      onClick={() => void codex.startLogin("chatgptDeviceCode")}
                    >
                      {t("onb.chatgpt.deviceCode")}
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
                    {t("onb.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="web-onboarding-pending" role="status">
                <Loader2 size={16} className="web-onboarding-spin" />
                <p>
                  {codex.status === null
                    ? t("onb.chatgpt.checkingRuntime")
                    : chatgptError || codex.message || t("onb.chatgpt.preparing")}
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
                      <ArrowLeft size={14} /> {t("onb.back")}
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
                      {t("onb.retry")}
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
            onConnected={() => finish("onb.claude")}
          />
        ) : null}

        {step === "api" ? (
          <ApiKeyStep onBack={() => setStep("choose")} onConnected={() => finish("onb.api")} />
        ) : null}

        {step === "done" ? (
          <div className="web-onboarding-step web-onboarding-done">
            <span className="web-onboarding-done-mark" aria-hidden="true">
              <Check size={20} strokeWidth={2.6} />
            </span>
            <div className="web-onboarding-step-head">
              <h2>{t("onb.ready")}</h2>
              <p className="web-onboarding-hint">
                {t("onb.readyHint", { connection: t(summary) })}
              </p>
            </div>
            <ol className="web-onboarding-tour">
              {FIRST_STEPS.map((item) => (
                <li key={item.title}>
                  <strong>
                    {t(item.title)}
                    {item.keys ? (
                      <span className="web-onboarding-keys">
                        {item.keys.map((key) => (
                          <kbd key={key}>{key}</kbd>
                        ))}
                      </span>
                    ) : null}
                  </strong>
                  <span>{t(item.detail)}</span>
                </li>
              ))}
            </ol>
            <button type="button" className="web-onboarding-primary" onClick={start}>
              {t("onb.start")}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
