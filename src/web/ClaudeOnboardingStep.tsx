import { ArrowLeft, ExternalLink, Loader2, Sparkles } from "lucide-react"
import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import { useClaudeSettings } from "../renderer/components/useClaudeSettings"
import { useTranslator } from "../renderer/lib/locale"
import { DEFAULT_CLAUDE_EFFORT, DEFAULT_CLAUDE_MODEL } from "../shared/claudeTypes"
import { webMessages } from "./messages"

export function ClaudeOnboardingStep({
  onBack,
  onConnected,
}: {
  readonly onBack: () => void
  readonly onConnected: () => Promise<void>
}): JSX.Element {
  const t = useTranslator(webMessages)
  const [error, setError] = useState("")
  const connecting = useRef(false)

  const connect = useCallback(async (): Promise<void> => {
    if (connecting.current) return
    connecting.current = true
    try {
      await window.ohmypaper.saveAiMode({
        mode: "claude",
        claudeModel: DEFAULT_CLAUDE_MODEL,
        claudeEffort: DEFAULT_CLAUDE_EFFORT,
      })
      await onConnected()
    } catch (cause) {
      connecting.current = false
      setError(cause instanceof Error ? cause.message : t("onb.saveFailed"))
    }
  }, [onConnected, t])

  const claude = useClaudeSettings({ onConnectionChange: connect })
  const { status } = claude

  useEffect(() => {
    if (status?.authenticated && !status.loginPending) void connect()
  }, [status, connect])

  const problem =
    error ||
    (status?.available === false
      ? t("onb.claude.missing")
      : claude.message && !status?.loginPending
        ? claude.message
        : "")

  return (
    <div className="web-onboarding-step">
      <h2>{t("onb.claude.title")}</h2>
      <div className="web-onboarding-pending" role="status">
        {status === null || status.loginPending || status.authenticated ? (
          <Loader2 size={16} className="web-onboarding-spin" />
        ) : null}
        <p>
          {status === null
            ? t("onb.claude.checking")
            : status.loginPending
              ? t("onb.claude.finish")
              : status.authenticated
                ? t("onb.claude.connectingAs", { account: status.email ?? "Claude" })
                : problem || t("onb.claude.intro")}
        </p>
        <div className="web-onboarding-actions">
          <button type="button" className="web-onboarding-ghost" onClick={onBack}>
            <ArrowLeft size={14} /> {t("onb.back")}
          </button>
          {status?.loginPending ? (
            <>
              {status.loginUrl ? (
                <a
                  className="web-onboarding-ghost"
                  href={status.loginUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} /> {t("onb.signInPage")}
                </a>
              ) : null}
              <button
                type="button"
                className="web-onboarding-ghost"
                onClick={() => void claude.cancelLogin()}
              >
                {t("onb.cancel")}
              </button>
            </>
          ) : status && !status.authenticated && status.available ? (
            <button
              type="button"
              className="web-onboarding-primary"
              disabled={claude.busy}
              onClick={() => void claude.startLogin()}
            >
              <Sparkles size={15} /> {t("onb.claude.signIn")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
