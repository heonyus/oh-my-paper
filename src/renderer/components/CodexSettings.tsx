import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react"
import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import {
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_EFFORT_OPTIONS,
  type CodexAccountStatus,
  type CodexLoginType,
} from "../../shared/codexTypes"
import type { CodexReasoningEffort } from "../../shared/ipc"
import { SubscriptionUsage } from "./SubscriptionUsage"

export function CodexSettings({
  onConnectionChange,
}: {
  readonly onConnectionChange?: (() => Promise<void>) | undefined
}): JSX.Element {
  const [status, setStatus] = useState<CodexAccountStatus | null>(null)
  const [loginId, setLoginId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [selectedModel, setSelectedModel] = useState("gpt-5.6-sol")
  const [selectedEffort, setSelectedEffort] = useState<CodexReasoningEffort>("medium")
  const changed = useRef(onConnectionChange)
  useEffect(() => {
    changed.current = onConnectionChange
  }, [onConnectionChange])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setStatus(await window.scourgify.codex.getStatus())
      const pStatus = await window.scourgify.providerStatus()
      if (pStatus.codexModel) setSelectedModel(pStatus.codexModel)
      if (pStatus.codexReasoningEffort) setSelectedEffort(pStatus.codexReasoningEffort)
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    void refresh()
    return window.scourgify.codex.onLoginCompleted((event) => {
      setLoginId(null)
      setMessage(event.success ? "로그인 완료" : (event.error ?? "로그인 실패"))
      void refresh()
      void changed.current?.().catch((error: unknown) => setMessage(errorMessage(error)))
    })
  }, [refresh])

  async function startLogin(type: CodexLoginType): Promise<void> {
    setBusy(true)
    setMessage("")
    try {
      const result = await window.scourgify.codex.startLogin(type)
      await window.scourgify.saveAiMode("chatgpt")
      if (result.type === "chatgpt") {
        setLoginId(result.loginId)
        await window.scourgify.openExternal({ url: result.authUrl })
      } else if (result.type === "chatgptDeviceCode") {
        setLoginId(result.loginId)
        await window.scourgify.openExternal({ url: result.verificationUrl })
        setMessage(`코드: ${result.userCode}`)
      } else {
        setMessage("ChatGPT 로그인 응답을 이해할 수 없습니다")
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function cancelLogin(): Promise<void> {
    if (!loginId) return
    setBusy(true)
    try {
      await window.scourgify.codex.cancelLogin(loginId)
      setLoginId(null)
      setMessage("로그인 취소됨")
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function logout(): Promise<void> {
    setBusy(true)
    try {
      await window.scourgify.codex.logout()
      await refresh()
      await changed.current?.()
      setMessage("이 앱의 ChatGPT 연결을 해제했습니다")
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function updateModel(nextModel: string): Promise<void> {
    setSelectedModel(nextModel)
    try {
      await window.scourgify.saveAiMode({
        mode: "chatgpt",
        codexModel: nextModel,
        codexReasoningEffort: selectedEffort,
      })
      await changed.current?.()
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  async function updateEffort(nextEffort: CodexReasoningEffort): Promise<void> {
    setSelectedEffort(nextEffort)
    try {
      await window.scourgify.saveAiMode({
        mode: "chatgpt",
        codexModel: selectedModel,
        codexReasoningEffort: nextEffort,
      })
      await changed.current?.()
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  const account = status?.account?.type === "chatgpt" ? status.account : null
  const isConnected = Boolean(status?.authenticated)
  const isError = Boolean(status?.error)
  const badgeStatus =
    status === null ? "pending" : isConnected ? "connected" : isError ? "error" : "needed"
  const isErrorMsg = /실패|error|Error/i.test(message)
  return (
    <section className="settings-group codex-settings-card" aria-label="ChatGPT 구독">
      <div className="codex-card-header">
        <div className="codex-card-titles">
          <h4>ChatGPT 구독 연결</h4>
          <p className="settings-help">구독에 포함된 Codex 사용량을 이용합니다.</p>
        </div>
        <span className="settings-badge" data-status={badgeStatus} role="status">
          <i />
          {status === null
            ? "확인 중…"
            : isConnected
              ? `연결됨${account?.email ? ` · ${account.email}` : ""}`
              : isError
                ? `사용 불가: ${status.error}`
                : "로그인 필요"}
        </span>
      </div>
      {loginId ? (
        <div className="settings-alert-banner" data-variant="info" role="status">
          <Info size={15} />
          <span>브라우저에서 승인을 완료한 뒤 돌아오세요.</span>
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
          {CODEX_MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
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
          onChange={(event) => void updateEffort(event.currentTarget.value as CodexReasoningEffort)}
        >
          {CODEX_REASONING_EFFORT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {status?.authenticated ? <SubscriptionUsage status={status} /> : null}
      {status?.available === false ? (
        <div className="settings-alert-banner" data-variant="warning">
          <AlertCircle size={15} />
          <span>Codex CLI 설치 후 다시 확인하세요. 다른 앱의 로그인 정보는 가져오지 않습니다.</span>
        </div>
      ) : null}
      {message ? (
        <div
          className="settings-alert-banner"
          data-variant={isErrorMsg ? "error" : "info"}
          role="status"
        >
          {isErrorMsg ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
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
        {loginId ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={busy}
            onClick={() => void cancelLogin()}
          >
            로그인 취소
          </button>
        ) : status?.authenticated ? (
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청 실패"
}
