import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react"
import type { JSX } from "react"
import { codexModelChoices, codexReasoningEffortOptions } from "../../shared/codexTypes"
import { SubscriptionUsage } from "./SubscriptionUsage"
import { isCodexReasoningEffort, useCodexSettings } from "./useCodexSettings"

export function CodexSettings({
  onConnectionChange,
}: {
  readonly onConnectionChange?: (() => Promise<void>) | undefined
}): JSX.Element {
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
    <section className="settings-group codex-settings-card" aria-label="ChatGPT 구독">
      <div className="codex-card-header">
        <div className="codex-card-titles">
          <h4>ChatGPT 구독 연결</h4>
          <p className="settings-help">구독에 포함된 Codex 사용량을 이용합니다.</p>
        </div>
        <span className="settings-badge" data-status={badgeStatus} role="status">
          <i />
          {pendingLogin
            ? "로그인 진행 중…"
            : status === null
              ? "확인 중…"
              : isConnected
                ? `연결됨${account?.email ? ` · ${account.email}` : ""}`
                : isError
                  ? `사용 불가: ${status.error}`
                  : "로그인 필요"}
        </span>
      </div>
      {pendingLogin ? (
        <div className="settings-alert-banner" data-variant="info" role="status">
          <Info size={15} />
          <span>
            {pendingLogin.userCode
              ? `브라우저에서 승인을 완료한 뒤 기기 코드 ${pendingLogin.userCode}를 입력하세요.`
              : "브라우저에서 승인을 완료한 뒤 돌아오세요."}{" "}
            <a href={pendingLogin.authUrl} target="_blank" rel="noreferrer">
              로그인 페이지 다시 열기
            </a>
          </span>
        </div>
      ) : null}
      <div className="settings-row">
        <span>
          <strong>구독 모델</strong>
          <small>질의응답, 요약, 리더 해설에 사용됩니다.</small>
        </span>
        <select
          aria-label="구독 모델"
          value={selectedModel}
          onChange={(event) => void updateModel(event.currentTarget.value)}
        >
          {codexModelChoices(models, selectedModel).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.description ? `${opt.label} — ${opt.description}` : opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <span>
          <strong>추론 수준 (Thinking)</strong>
          <small>복잡한 수식과 심층 검증에 사용할 CoT 사고 깊이</small>
        </span>
        <select
          aria-label="추론 수준"
          value={selectedEffort}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (isCodexReasoningEffort(next)) void updateEffort(next)
          }}
        >
          {codexReasoningEffortOptions(selectedModel, models).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {status && isConnected ? <SubscriptionUsage status={status} /> : null}
      {status?.available === false ? (
        <div className="settings-alert-banner" data-variant="warning">
          <AlertCircle size={15} />
          <span>
            앱 내부에 설치된 OpenAI 로그인 런타임을 사용할 수 없습니다. CLI를 따로 실행할 필요는
            없으며, 앱을 업데이트한 뒤 다시 확인하세요.
          </span>
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
          상태 새로고침
        </button>
        {pendingLogin ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={busy}
            onClick={() => void cancelLogin()}
          >
            로그인 취소
          </button>
        ) : isConnected ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={busy}
            onClick={() => void logout()}
          >
            로그아웃
          </button>
        ) : (
          <div className="codex-login-buttons">
            <button
              type="button"
              className="settings-btn-secondary"
              disabled={busy || !status?.available}
              onClick={() => void startLogin("chatgptDeviceCode")}
            >
              기기 코드로 로그인
            </button>
            <button
              type="button"
              disabled={busy || !status?.available}
              className="settings-save"
              onClick={() => void startLogin("chatgpt")}
            >
              {busy ? <Loader2 size={14} className="settings-spinner" /> : null}
              {busy ? "로그인 준비 중…" : "ChatGPT로 로그인"}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
