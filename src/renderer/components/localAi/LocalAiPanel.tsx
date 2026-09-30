import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import {
  LOCAL_INFERENCE_CANDIDATE,
  type LocalInferenceApi,
  type LocalInferenceSetupCheck,
  type LocalInferenceStatus,
} from "../../../shared/localInference"
import { useTranslator } from "../../lib/locale"
import { useLocalSuggestions } from "../../lib/useLocalSuggestions"
import { localAiMessages } from "../../messages/localAi"
import "./local-ai.css"

export type LocalAiPanelProps = {
  readonly api: LocalInferenceApi | null
  readonly nodeTitle: string
  readonly draft: string
  readonly imeComposing: boolean
  readonly onInsertSuggestion?: (suggestion: string) => void
  readonly showSuggestions?: boolean
  readonly runSuggestions?: boolean
}

type BusyState = "idle" | "status" | "setup" | "enable"

type Translate = ReturnType<typeof useTranslator<(typeof localAiMessages)["ko"]>>

export function LocalAiPanel(props: LocalAiPanelProps): JSX.Element {
  const t = useTranslator(localAiMessages)
  const [status, setStatus] = useState<LocalInferenceStatus | null>(null)
  const [busy, setBusy] = useState<BusyState>("idle")
  const [error, setError] = useState<string | null>(null)
  // The latest wording, for the status check that outlives a language switch.
  const text = useRef(t)
  useEffect(() => {
    text.current = t
  }, [t])
  const suggestions = useLocalSuggestions({
    api: props.api,
    nodeTitle: props.nodeTitle,
    draft: props.draft,
    enabled: props.runSuggestions !== false && (status?.enabled ?? false),
    imeComposing: props.imeComposing,
  })

  const refresh = useCallback(async (): Promise<void> => {
    if (props.api === null) {
      setStatus(null)
      return
    }
    setBusy("status")
    try {
      setStatus(await props.api.getStatus())
      setError(null)
    } catch (_error) {
      setError(text.current("local.statusFailed"))
    } finally {
      setBusy("idle")
    }
  }, [props.api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function chooseSetup(): Promise<void> {
    if (props.api === null) return
    setBusy("setup")
    setError(null)
    try {
      await props.api.chooseSetup()
      await refresh()
    } catch (_error) {
      setError(t("local.verifyFailed"))
      setBusy("idle")
    }
  }

  async function toggleEnabled(): Promise<void> {
    if (props.api === null) return
    setBusy("enable")
    setError(null)
    try {
      setStatus(await props.api.enable(!(status?.enabled ?? false)))
    } catch (_error) {
      setError(t("local.toggleFailed"))
    } finally {
      setBusy("idle")
    }
  }

  return (
    <section className="local-ai" aria-labelledby="local-ai-title">
      <header className="local-ai__header">
        <div>
          <p className="local-ai__eyebrow">{t("local.eyebrow")}</p>
          <h2 id="local-ai-title">{t("local.title")}</h2>
        </div>
      </header>

      <p className="local-ai__intro">{t("local.intro")}</p>

      <div className="local-ai__status" aria-live="polite">
        <StatusSummary api={props.api} status={status} />
        {status ? <p>{deviceMessage(status, t)}</p> : null}
        {status ? <p>{setupMessage(status.setup, t)}</p> : null}
      </div>

      <div className="local-ai__facts">
        <p>
          {t("local.runtime", {
            name: LOCAL_INFERENCE_CANDIDATE.runtime.name,
            version: LOCAL_INFERENCE_CANDIDATE.runtime.version,
          })}
        </p>
        <p>{t("local.model", { name: LOCAL_INFERENCE_CANDIDATE.model.name })}</p>
        <p>{t("local.license", { license: LOCAL_INFERENCE_CANDIDATE.model.license })}</p>
      </div>

      {error ? (
        <p className="local-ai__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="local-ai__actions">
        <button
          type="button"
          disabled={props.api === null || busy !== "idle"}
          onClick={() => void chooseSetup()}
        >
          {busy === "setup" ? t("local.verifying") : t("local.chooseSetup")}
        </button>
        <button
          type="button"
          className="local-ai__secondary"
          disabled={props.api === null || busy !== "idle"}
          onClick={() => void toggleEnabled()}
        >
          {busy === "enable"
            ? t("local.changing")
            : status?.enabled
              ? t("local.turnOff")
              : t("local.turnOn")}
        </button>
      </div>

      <p className="local-ai__download-note">{t("local.downloadNote")}</p>

      {props.showSuggestions !== false ? (
        <div className="local-ai__suggestions" aria-live="polite">
          <div className="local-ai__suggestion-heading">
            <h3>{t("local.suggestions")}</h3>
            {suggestions.pending ? <span>{t("local.waiting")}</span> : null}
          </div>
          {suggestions.error ? <p className="local-ai__error">{suggestions.error}</p> : null}
          <ul>
            {suggestions.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button type="button" onClick={() => props.onInsertSuggestion?.(suggestion)}>
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function StatusSummary({
  api,
  status,
}: {
  readonly api: LocalInferenceApi | null
  readonly status: LocalInferenceStatus | null
}): JSX.Element {
  const t = useTranslator(localAiMessages)
  if (api === null) return <p>{t("local.status.noApi")}</p>
  if (status === null) return <p>{t("local.status.checking")}</p>
  if (!status.device.supported) return <p>{t("local.status.unsupported")}</p>
  if (!status.enabled) return <p>{t("local.status.off")}</p>
  if (status.setup.status !== "ready") return <p>{t("local.status.needsSetup")}</p>
  return <p>{t("local.status.ready")}</p>
}

function deviceMessage(status: LocalInferenceStatus, t: Translate): string {
  return t("local.device", {
    platform: status.device.platform,
    arch: status.device.arch,
    support: status.device.supported ? t("local.device.supported") : t("local.device.unsupported"),
  })
}

function setupMessage(setup: LocalInferenceSetupCheck, t: Translate): string {
  if (setup.status === "ready") return t("local.setup.ready")
  switch (setup.reason) {
    case "disabled":
      return t("local.setup.disabled")
    case "unsupported_device":
      return t("local.setup.unsupportedDevice")
    case "setup_required":
      return t("local.setup.setupRequired")
    case "license_required":
      return t("local.setup.licenseRequired")
    case "runtime_missing":
      return t("local.setup.runtimeMissing")
    case "runtime_archive_missing":
      return t("local.setup.runtimeArchiveMissing")
    case "runtime_archive_hash_mismatch":
      return t("local.setup.runtimeArchiveHashMismatch")
    case "runtime_executable_hash_mismatch":
      return t("local.setup.runtimeExecutableHashMismatch")
    case "model_revision_mismatch":
      return t("local.setup.modelRevisionMismatch")
    case "model_missing":
      return t("local.setup.modelMissing")
    case "model_hash_mismatch":
      return t("local.setup.modelHashMismatch")
    case "execution_failed":
      return t("local.setup.executionFailed")
    case "cancelled":
      return t("local.setup.cancelled")
    default:
      return assertNever(setup.reason)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected local inference state: ${String(value)}`)
}
