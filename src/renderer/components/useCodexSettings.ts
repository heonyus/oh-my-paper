import { useCallback, useEffect, useRef, useState } from "react"
import {
  CODEX_DEFAULT_MODEL,
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_EFFORT_OPTIONS,
  type CodexAccountStatus,
  type CodexLoginStartResult,
  type CodexLoginType,
  type CodexModel,
} from "../../shared/codexTypes"
import type { CodexReasoningEffort } from "../../shared/ipc"
import { useTranslator } from "../lib/locale"
import { subscriptionMessages } from "../messages/subscription"

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
  /** The account's models from the runtime; the bundled list until it answers. */
  readonly models: readonly CodexModel[]
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
  const t = useTranslator(subscriptionMessages)
  const [status, setStatus] = useState<CodexAccountStatus | null>(null)
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [models, setModels] = useState<readonly CodexModel[]>(CODEX_MODEL_OPTIONS)
  const [selectedModel, setSelectedModel] = useState<string>(CODEX_DEFAULT_MODEL)
  const [selectedEffort, setSelectedEffort] = useState<CodexReasoningEffort>("medium")
  const changed = useRef(onConnectionChange)
  const pendingLoginRef = useRef<PendingLogin | null>(null)
  // The latest wording, for callbacks that outlive a language switch.
  const text = useRef(t)

  useEffect(() => {
    changed.current = onConnectionChange
  }, [onConnectionChange])

  useEffect(() => {
    text.current = t
  }, [t])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const nextStatus = await window.ohmypaper.codex.getStatus()
      setStatus(nextStatus)
      if (nextStatus.authenticated) {
        setModels(await window.ohmypaper.codex.listModels().catch(() => CODEX_MODEL_OPTIONS))
      }
      const providerStatus = await window.ohmypaper.providerStatus()
      if (providerStatus.codexModel) setSelectedModel(providerStatus.codexModel)
      if (providerStatus.codexReasoningEffort)
        setSelectedEffort(providerStatus.codexReasoningEffort)
    } catch (error) {
      setMessage(errorMessage(error, text.current("sub.requestFailed")))
    }
  }, [])

  useEffect(() => {
    void refresh()
    return window.ohmypaper.codex.onLoginCompleted((event) => {
      const activeLogin = pendingLoginRef.current
      if (!activeLogin || event.loginId !== activeLogin.loginId) return
      pendingLoginRef.current = null
      setPendingLogin(null)
      setMessage(
        event.success
          ? text.current("sub.signedIn")
          : (event.error ?? text.current("sub.chatgpt.signInFailed")),
      )
      void refresh()
      void changed
        .current?.()
        .catch((error: unknown) =>
          setMessage(errorMessage(error, text.current("sub.requestFailed"))),
        )
    })
  }, [refresh])

  const failed = t("sub.requestFailed")

  async function startLogin(type: CodexLoginType): Promise<void> {
    setBusy(true)
    setMessage("")
    try {
      const result = await window.ohmypaper.codex.startLogin(type)
      const pending = pendingLoginFromResult(result)
      if (!pending) {
        setMessage(t("sub.chatgpt.unsupportedLogin"))
        return
      }
      pendingLoginRef.current = pending
      setPendingLogin(pending)
      try {
        await window.ohmypaper.openExternal({ url: pending.authUrl })
        setMessage(
          pending.userCode
            ? t("sub.chatgpt.approveWithCode", { code: pending.userCode })
            : t("sub.chatgpt.approve"),
        )
      } catch (error) {
        setMessage(t("sub.chatgpt.browserFailed", { error: errorMessage(error, failed) }))
      }
    } catch (error) {
      setMessage(errorMessage(error, failed))
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
      setMessage(t("sub.signInCancelled"))
    } catch (error) {
      setMessage(errorMessage(error, failed))
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
      setMessage(t("sub.chatgpt.signedOut"))
    } catch (error) {
      setMessage(errorMessage(error, failed))
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
      setMessage(errorMessage(error, failed))
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
      setMessage(errorMessage(error, failed))
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
    models,
    pendingLogin,
    message,
    busy,
    selectedModel,
    selectedEffort,
    isConnected,
    isError,
    badgeStatus,
    // Failure wording in either language, or the runtime's own `error` text.
    messageIsError: /실패|못했습니다|error|Error|failed|could not/i.test(message),
    refresh,
    startLogin,
    cancelLogin,
    logout,
    updateModel,
    updateEffort,
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
