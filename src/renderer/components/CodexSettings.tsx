import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react"
import type { JSX } from "react"
import {
  codexModelChoices,
  codexModelHint,
  codexReasoningEffortOptions,
} from "../../shared/codexTypes"
import { useLocale, useTranslator } from "../lib/locale"
import { subscriptionMessages } from "../messages/subscription"
import { SubscriptionUsage } from "./SubscriptionUsage"
import { isCodexReasoningEffort, useCodexSettings } from "./useCodexSettings"

export function CodexSettings({
  onConnectionChange,
}: {
  readonly onConnectionChange?: (() => Promise<void>) | undefined
}): JSX.Element {
  const t = useTranslator(subscriptionMessages)
  const { locale } = useLocale()
  const {
    status,
    models,
    pendingLogin,
    message,
    busy,
    selectedModel,
    selectedEffort,
    isConnected,
    isError,
    badgeStatus,
    messageIsError,
    refresh,
    startLogin,
    cancelLogin,
    logout,
    updateModel,
    updateEffort,
  } = useCodexSettings({ onConnectionChange })
  const account = status?.account?.type === "chatgpt" ? status.account : null
  return (
    <section className="settings-group codex-settings-card" aria-label={t("sub.chatgpt")}>
      <div className="codex-card-header">
        <div className="codex-card-titles">
          <h4>{t("sub.chatgpt.title")}</h4>
          <p className="settings-help">{t("sub.chatgpt.help")}</p>
        </div>
        <span className="settings-badge" data-status={badgeStatus} role="status">
          <i />
          {pendingLogin
            ? t("sub.signingIn")
            : status === null
              ? t("sub.checking")
              : isConnected
                ? `${t("sub.connected")}${account?.email ? ` · ${account.email}` : ""}`
                : isError
                  ? t("sub.unavailable", { error: status.error ?? "" })
                  : t("sub.signInNeeded")}
        </span>
      </div>
      {pendingLogin ? (
        <div className="settings-alert-banner" data-variant="info" role="status">
          <Info size={15} />
          <span>
            {pendingLogin.userCode
              ? t("sub.chatgpt.enterCode", { code: pendingLogin.userCode })
              : t("sub.chatgpt.comeBack")}{" "}
            <a href={pendingLogin.authUrl} target="_blank" rel="noreferrer">
              {t("sub.reopenSignIn")}
            </a>
          </span>
        </div>
      ) : null}
      <div className="settings-row">
        <span>
          <strong>{t("sub.chatgpt.model")}</strong>
          <small>{t("sub.chatgpt.modelDetail")}</small>
        </span>
        <select
          aria-label={t("sub.chatgpt.model")}
          value={selectedModel}
          onChange={(event) => void updateModel(event.currentTarget.value)}
        >
          {codexModelChoices(models, selectedModel, locale).map((opt) => {
            const hint = codexModelHint(opt.id, locale) ?? opt.description
            return (
              <option key={opt.id} value={opt.id}>
                {hint ? `${opt.label} — ${hint}` : opt.label}
              </option>
            )
          })}
        </select>
      </div>
      <div className="settings-row">
        <span>
          <strong>{t("sub.chatgpt.effort")}</strong>
          <small>{t("sub.chatgpt.effortDetail")}</small>
        </span>
        <select
          aria-label={t("sub.chatgpt.effortLabel")}
          value={selectedEffort}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (isCodexReasoningEffort(next)) void updateEffort(next)
          }}
        >
          {codexReasoningEffortOptions(selectedModel, models).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label[locale]}
            </option>
          ))}
        </select>
      </div>
      {status && isConnected ? <SubscriptionUsage status={status} /> : null}
      {status?.available === false ? (
        <div className="settings-alert-banner" data-variant="warning">
          <AlertCircle size={15} />
          <span>{t("sub.chatgpt.runtimeMissing")}</span>
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
        {pendingLogin ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={busy}
            onClick={() => void cancelLogin()}
          >
            {t("sub.cancelSignIn")}
          </button>
        ) : isConnected ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={busy}
            onClick={() => void logout()}
          >
            {t("sub.chatgpt.signOut")}
          </button>
        ) : (
          <div className="codex-login-buttons">
            <button
              type="button"
              className="settings-btn-secondary"
              disabled={busy || !status?.available}
              onClick={() => void startLogin("chatgptDeviceCode")}
            >
              {t("sub.chatgpt.deviceCode")}
            </button>
            <button
              type="button"
              disabled={busy || !status?.available}
              className="settings-save"
              onClick={() => void startLogin("chatgpt")}
            >
              {busy ? <Loader2 size={14} className="settings-spinner" /> : null}
              {busy ? t("sub.preparingSignIn") : t("sub.chatgpt.signIn")}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
