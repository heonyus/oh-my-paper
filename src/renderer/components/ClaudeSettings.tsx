import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react"
import type { JSX } from "react"
import { CLAUDE_EFFORT_OPTIONS, claudeModelChoices, isClaudeEffort } from "../../shared/claudeTypes"
import { useClaudeSettings } from "./useClaudeSettings"

export function ClaudeSettings({
  onConnectionChange,
}: {
  readonly onConnectionChange?: (() => Promise<void>) | undefined
}): JSX.Element {
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
  const messageIsError = /실패|못했|않았|error/i.test(message)
  return (
    <section className="settings-group codex-settings-card" aria-label="Claude 구독">
      <div className="codex-card-header">
        <div className="codex-card-titles">
          <h4>Claude 구독 연결</h4>
          <p className="settings-help">
            이 컴퓨터의 Claude Code 로그인으로 구독 사용량을 이용합니다. API 키는 쓰지 않습니다.
          </p>
        </div>
        <span className="settings-badge" data-status={badgeStatus} role="status">
          <i />
          {pending
            ? "로그인 진행 중…"
            : status === null
              ? "확인 중…"
              : isConnected
                ? `연결됨${status.subscriptionType ? ` · ${status.subscriptionType}` : ""}${status.email ? ` · ${status.email}` : ""}`
                : status.error
                  ? `사용 불가: ${status.error}`
                  : "로그인 필요"}
        </span>
      </div>
      {pending ? (
        <div className="settings-alert-banner" data-variant="info" role="status">
          <Info size={15} />
          <span>
            브라우저에서 Claude 로그인을 완료한 뒤 돌아오세요.{" "}
            {status?.loginUrl ? (
              <a href={status.loginUrl} target="_blank" rel="noreferrer">
                로그인 페이지 다시 열기
              </a>
            ) : null}
          </span>
        </div>
      ) : null}
      <div className="settings-row">
        <span>
          <strong>Claude 모델</strong>
          <small>번역, 해설, 질의응답, 요약에 사용됩니다.</small>
        </span>
        <select
          aria-label="Claude 모델"
          value={selectedModel}
          onChange={(event) => void updateModel(event.currentTarget.value)}
        >
          {claudeModelChoices(selectedModel).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <span>
          <strong>추론 수준 (Effort)</strong>
          <small>높을수록 느리지만 더 깊이 검토합니다. Haiku에는 적용되지 않습니다.</small>
        </span>
        <select
          aria-label="Claude 추론 수준"
          value={selectedEffort}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (isClaudeEffort(next)) void updateEffort(next)
          }}
        >
          {CLAUDE_EFFORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {status?.available === false ? (
        <div className="settings-alert-banner" data-variant="warning">
          <AlertCircle size={15} />
          <span>Claude Code CLI를 찾지 못했습니다. 설치한 뒤 상태를 새로고침하세요.</span>
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
        {pending ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={busy}
            onClick={() => void cancelLogin()}
          >
            로그인 취소
          </button>
        ) : !isConnected ? (
          <button
            type="button"
            className="settings-save"
            disabled={busy || !status?.available}
            onClick={() => void startLogin()}
          >
            {busy ? <Loader2 size={14} className="settings-spinner" /> : null}
            {busy ? "로그인 준비 중…" : "Claude로 로그인"}
          </button>
        ) : null}
      </div>
    </section>
  )
}
