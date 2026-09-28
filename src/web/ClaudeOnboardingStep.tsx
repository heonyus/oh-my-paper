import { ArrowLeft, ExternalLink, Loader2, Sparkles } from "lucide-react"
import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import { useClaudeSettings } from "../renderer/components/useClaudeSettings"
import { DEFAULT_CLAUDE_EFFORT, DEFAULT_CLAUDE_MODEL } from "../shared/claudeTypes"

export function ClaudeOnboardingStep({
  onBack,
  onConnected,
}: {
  readonly onBack: () => void
  readonly onConnected: () => Promise<void>
}): JSX.Element {
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
      setError(cause instanceof Error ? cause.message : "저장에 실패했습니다")
    }
  }, [onConnected])

  const claude = useClaudeSettings({ onConnectionChange: connect })
  const { status } = claude

  useEffect(() => {
    if (status?.authenticated && !status.loginPending) void connect()
  }, [status, connect])

  const problem =
    error ||
    (status?.available === false
      ? "Claude Code CLI(claude)를 찾지 못했습니다. 설치 후 다시 시도하세요."
      : claude.message && !status?.loginPending
        ? claude.message
        : "")

  return (
    <div className="web-onboarding-step">
      <h2>Claude 구독 연결</h2>
      <div className="web-onboarding-pending" role="status">
        {status === null || status.loginPending || status.authenticated ? (
          <Loader2 size={16} className="web-onboarding-spin" />
        ) : null}
        <p>
          {status === null
            ? "Claude Code 로그인 상태를 확인하는 중…"
            : status.loginPending
              ? "열린 브라우저에서 Claude 로그인을 완료하세요"
              : status.authenticated
                ? `${status.email ?? "Claude"} 계정으로 연결하는 중…`
                : problem || "이 Mac의 Claude Code로 로그인하면 구독 사용량으로 바로 시작합니다."}
        </p>
        <div className="web-onboarding-actions">
          <button type="button" className="web-onboarding-ghost" onClick={onBack}>
            <ArrowLeft size={14} /> 뒤로
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
                  <ExternalLink size={14} /> 로그인 페이지
                </a>
              ) : null}
              <button
                type="button"
                className="web-onboarding-ghost"
                onClick={() => void claude.cancelLogin()}
              >
                취소
              </button>
            </>
          ) : status && !status.authenticated && status.available ? (
            <button
              type="button"
              className="web-onboarding-primary"
              disabled={claude.busy}
              onClick={() => void claude.startLogin()}
            >
              <Sparkles size={15} /> Claude로 로그인
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
