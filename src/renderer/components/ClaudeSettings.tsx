import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react"
import type { JSX } from "react"
import { CLAUDE_EFFORT_OPTIONS, claudeModelChoices, isClaudeEffort } from "../../shared/claudeTypes"
import { useLocale, useTranslator } from "../lib/locale"
import { subscriptionMessages } from "../messages/subscription"
import { useClaudeSettings } from "./useClaudeSettings"

export function ClaudeSettings({
  onConnectionChange,
}: {
  readonly onConnectionChange?: (() => Promise<void>) | undefined
}): JSX.Element {
  const t = useTranslator(subscriptionMessages)
  const { locale } = useLocale()
  const {
    status,
    message,
    busy,
    selectedModel,
    selectedEffort,
    isConnected,
    refresh,
    startLogin,
    cancelLogin,
    updateModel,
    updateEffort,
  } = useClaudeSettings({ onConnectionChange })
  const pending = status?.loginPending ?? false
  const badgeStatus =
    pending || status === null
      ? "pending"
      : isConnected
        ? "connected"
        : status.error
          ? "error"
          : "needed"
  // Failure wording in either language, or the CLI's own `error` text.
  const messageIsError = /실패|못했|않았|error|failed|could not|not completed/i.test(message)
  return (
    <section className="settings-group codex-settings-card" aria-label={t("sub.claude")}>
      <div className="codex-card-header">
        <div className="codex-card-titles">
          <h4>{t("sub.claude.title")}</h4>
          <p className="settings-help">{t("sub.claude.help")}</p>
        </div>
        <span className="settings-badge" data-status={badgeStatus} role="status">
          <i />
          {pending
            ? t("sub.signingIn")
            : status === null
              ? t("sub.checking")
              : isConnected
                ? `${t("sub.connected")}${status.subscriptionType ? ` · ${status.subscriptionType}` : ""}${status.email ? ` · ${status.email}` : ""}`
                : status.error
                  ? t("sub.unavailable", { error: status.error })
                  : t("sub.signInNeeded")}
        </span>
      </div>
      {pending ? (
        <div className="settings-alert-banner" data-variant="info" role="status">
          <Info size={15} />
          <span>
            {t("sub.claude.comeBack")}{" "}
            {status?.loginUrl ? (
              <a href={status.loginUrl} target="_blank" rel="noreferrer">
                {t("sub.reopenSignIn")}
              </a>
            ) : null}
          </span>
        </div>
      ) : null}
      <div className="settings-row">
        <span>
          <strong>{t("sub.claude.model")}</strong>
          <small>{t("sub.claude.modelDetail")}</small>
        </span>
        <select
          aria-label={t("sub.claude.model")}
          value={selectedModel}
          onChange={(event) => void updateModel(event.currentTarget.value)}
        >
          {claudeModelChoices(selectedModel, locale).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <span>
          <strong>{t("sub.claude.effort")}</strong>
          <small>{t("sub.claude.effortDetail")}</small>
        </span>
        <select
          aria-label={t("sub.claude.effortLabel")}
          value={selectedEffort}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (isClaudeEffort(next)) void updateEffort(next)
          }}
        >
          {CLAUDE_EFFORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label[locale]}
            </option>
          ))}
        </select>
      </div>
      {status?.available === false ? (
        <div className="settings-alert-banner" data-variant="warning">
          <AlertCircle size={15} />
          <span>{t("sub.claude.cliMissing")}</span>
        </div>
      ) : null}
      {message ? (
        <div
          className="settings-alert-banner"
          data-variant={messageIsError ? "error" : "info"}
          role="status"
        >
          {messageIsError ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          <span>{message}</span>
        </div>
      ) : null}
      <div className="codex-card-actions">
        <button
          type="button"
          className="settings-btn-secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {t("sub.refresh")}
        </button>
        {pending ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={busy}
            onClick={() => void cancelLogin()}
          >
            {t("sub.cancelSignIn")}
          </button>
        ) : !isConnected ? (
          <button
            type="button"
            className="settings-save"
            disabled={busy || !status?.available}
            onClick={() => void startLogin()}
          >
            {busy ? <Loader2 size={14} className="settings-spinner" /> : null}
            {busy ? t("sub.preparingSignIn") : t("sub.claude.signIn")}
          </button>
        ) : null}
      </div>
    </section>
  )
}
