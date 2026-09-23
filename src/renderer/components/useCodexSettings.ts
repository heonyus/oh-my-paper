import { useCallback, useEffect, useRef, useState } from "react"
import {
  CODEX_REASONING_EFFORT_OPTIONS,
  type CodexAccountStatus,
  type CodexLoginStartResult,
  type CodexLoginType,
} from "../../shared/codexTypes"
import type { CodexReasoningEffort } from "../../shared/ipc"

export type PendingLogin = {
  readonly loginId: string
  readonly authUrl: string
  readonly userCode: string | null
}

export type CodexBadgeStatus = "pending" | "connected" | "error" | "needed"

export type CodexSettingsOptions = {
  readonly onConnectionChange?: (() => Promise<void>) | undefined
}

export type CodexSettingsState = {
  readonly status: CodexAccountStatus | null
  readonly pendingLogin: PendingLogin | null
  readonly message: string
  readonly busy: boolean
  readonly selectedModel: string
  readonly selectedEffort: CodexReasoningEffort
  readonly isConnected: boolean
  readonly isError: boolean
  readonly badgeStatus: CodexBadgeStatus
  readonly messageIsError: boolean
  readonly refresh: () => Promise<void>
  readonly startLogin: (type: CodexLoginType) => Promise<void>
  readonly cancelLogin: () => Promise<void>
  readonly logout: () => Promise<void>
  readonly updateModel: (nextModel: string) => Promise<void>
  readonly updateEffort: (nextEffort: CodexReasoningEffort) => Promise<void>
}

function pendingLoginFromResult(result: CodexLoginStartResult): PendingLogin | null {
  switch (result.type) {
    case "chatgpt":
      return { loginId: result.loginId, authUrl: result.authUrl, userCode: null }
    case "chatgptDeviceCode":
      return {
        loginId: result.loginId,
        authUrl: result.verificationUrl,
        userCode: result.userCode,
      }
    case "apiKey":
    case "chatgptAuthTokens":
    case "amazonBedrock":
      return null
  }
}

export function isCodexReasoningEffort(value: string): value is CodexReasoningEffort {
  return CODEX_REASONING_EFFORT_OPTIONS.some((option) => option.id === value)
}

export function useCodexSettings({ onConnectionChange }: CodexSettingsOptions): CodexSettingsState {
  const [status, setStatus] = useState<CodexAccountStatus | null>(null)
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [selectedModel, setSelectedModel] = useState("gpt-5.6-sol")
  const [selectedEffort, setSelectedEffort] = useState<CodexReasoningEffort>("medium")
  const changed = useRef(onConnectionChange)
  const pendingLoginRef = useRef<PendingLogin | null>(null)

  useEffect(() => {
    changed.current = onConnectionChange
  }, [onConnectionChange])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setStatus(await window.ohmypaper.codex.getStatus())
      const providerStatus = await window.ohmypaper.providerStatus()
      if (providerStatus.codexModel) setSelectedModel(providerStatus.codexModel)
      if (providerStatus.codexReasoningEffort)
        setSelectedEffort(providerStatus.codexReasoningEffort)
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    void refresh()
    return window.ohmypaper.codex.onLoginCompleted((event) => {
      const activeLogin = pendingLoginRef.current
      if (!activeLogin || event.loginId !== activeLogin.loginId) return
      pendingLoginRef.current = null
      setPendingLogin(null)
      setMessage(event.success ? "로그인 완료" : (event.error ?? "로그인 실패"))
      void refresh()
      void changed.current?.().catch((error: unknown) => setMessage(errorMessage(error)))
    })
  }, [refresh])

  async function startLogin(type: CodexLoginType): Promise<void> {
    setBusy(true)
    setMessage("")
    try {
      const result = await window.ohmypaper.codex.startLogin(type)
      const pending = pendingLoginFromResult(result)
      if (!pending) {
        setMessage("이 앱에서 지원하지 않는 로그인 응답입니다")
        return
      }
      pendingLoginRef.current = pending
      setPendingLogin(pending)
      try {
        await window.ohmypaper.openExternal({ url: pending.authUrl })
        setMessage(
          pending.userCode
            ? `브라우저에서 승인을 완료하세요. 기기 코드: ${pending.userCode}`
            : "브라우저에서 승인을 완료하세요.",
        )
      } catch (error) {
        setMessage(`브라우저를 자동으로 열지 못했습니다: ${errorMessage(error)}`)
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function cancelLogin(): Promise<void> {
    const activeLogin = pendingLoginRef.current
    if (!activeLogin) return
    setBusy(true)
    try {
      await window.ohmypaper.codex.cancelLogin(activeLogin.loginId)
      pendingLoginRef.current = null
      setPendingLogin(null)
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
      await window.ohmypaper.codex.logout()
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
    const previousModel = selectedModel
    setSelectedModel(nextModel)
    try {
      await window.ohmypaper.saveAiMode({
        mode: "chatgpt",
        codexModel: nextModel,
        codexReasoningEffort: selectedEffort,
      })
      await changed.current?.()
    } catch (error) {
      setSelectedModel(previousModel)
      setMessage(errorMessage(error))
    }
  }

  async function updateEffort(nextEffort: CodexReasoningEffort): Promise<void> {
    const previousEffort = selectedEffort
    setSelectedEffort(nextEffort)
    try {
      await window.ohmypaper.saveAiMode({
        mode: "chatgpt",
        codexModel: selectedModel,
        codexReasoningEffort: nextEffort,
      })
      await changed.current?.()
    } catch (error) {
      setSelectedEffort(previousEffort)
      setMessage(errorMessage(error))
    }
  }

  const isConnected = Boolean(status?.authenticated && !pendingLogin)
  const isError = Boolean(status?.error)
  const badgeStatus: CodexBadgeStatus = pendingLogin
    ? "pending"
    : status === null
      ? "pending"
      : isConnected
        ? "connected"
        : isError
          ? "error"
          : "needed"
  return {
    status,
    pendingLogin,
    message,
    busy,
    selectedModel,
    selectedEffort,
    isConnected,
    isError,
    badgeStatus,
    messageIsError: /실패|못했습니다|error|Error/i.test(message),
    refresh,
    startLogin,
    cancelLogin,
    logout,
    updateModel,
    updateEffort,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청 실패"
}
