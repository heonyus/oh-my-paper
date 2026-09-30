import { useCallback, useEffect, useRef, useState } from "react"
import {
  type ClaudeAccountStatus,
  type ClaudeEffort,
  DEFAULT_CLAUDE_EFFORT,
  DEFAULT_CLAUDE_MODEL,
} from "../../shared/claudeTypes"
import { useTranslator } from "../lib/locale"
import { subscriptionMessages } from "../messages/subscription"

export type ClaudeSettingsState = {
  readonly supported: boolean
  readonly status: ClaudeAccountStatus | null
  readonly message: string
  readonly busy: boolean
  readonly selectedModel: string
  readonly selectedEffort: ClaudeEffort
  readonly isConnected: boolean
  readonly refresh: () => Promise<void>
  readonly startLogin: () => Promise<void>
  readonly cancelLogin: () => Promise<void>
  readonly updateModel: (nextModel: string) => Promise<void>
  readonly updateEffort: (nextEffort: ClaudeEffort) => Promise<void>
}

const LOGIN_POLL_MS = 2_000

export function useClaudeSettings({
  onConnectionChange,
}: {
  readonly onConnectionChange?: (() => Promise<void>) | undefined
}): ClaudeSettingsState {
  const api = window.ohmypaper.claude
  const t = useTranslator(subscriptionMessages)
  const [status, setStatus] = useState<ClaudeAccountStatus | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_CLAUDE_MODEL)
  const [selectedEffort, setSelectedEffort] = useState<ClaudeEffort>(DEFAULT_CLAUDE_EFFORT)
  const changed = useRef(onConnectionChange)
  const wasPending = useRef(false)
  // The latest wording, for callbacks that outlive a language switch.
  const text = useRef(t)

  useEffect(() => {
    changed.current = onConnectionChange
  }, [onConnectionChange])

  useEffect(() => {
    text.current = t
  }, [t])

  const refresh = useCallback(async (): Promise<void> => {
    if (!api) return
    try {
      setStatus(await api.getStatus())
      const providerStatus = await window.ohmypaper.providerStatus()
      if (providerStatus.claudeModel) setSelectedModel(providerStatus.claudeModel)
      if (providerStatus.claudeEffort) setSelectedEffort(providerStatus.claudeEffort)
    } catch (error) {
      setMessage(errorMessage(error, text.current("sub.requestFailed")))
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!api || !status?.loginPending) return
    const timer = setInterval(() => {
      void api
        .getStatus()
        .then(setStatus)
        .catch((error: unknown) =>
          setMessage(errorMessage(error, text.current("sub.requestFailed"))),
        )
    }, LOGIN_POLL_MS)
    return () => clearInterval(timer)
  }, [api, status?.loginPending])

  useEffect(() => {
    if (!status) return
    if (wasPending.current && !status.loginPending) {
      setMessage(
        status.authenticated
          ? text.current("sub.signedIn")
          : text.current("sub.claude.notCompleted"),
      )
      if (status.authenticated) {
        void changed
          .current?.()
          .catch((error: unknown) =>
            setMessage(errorMessage(error, text.current("sub.requestFailed"))),
          )
      }
    }
    wasPending.current = status.loginPending
  }, [status])

  const failed = t("sub.requestFailed")

  async function startLogin(): Promise<void> {
    if (!api) return
    setBusy(true)
    setMessage("")
    try {
      const next = await api.startLogin()
      setStatus(next)
      if (next.loginPending) setMessage(t("sub.claude.finishInBrowser"))
    } catch (error) {
      setMessage(errorMessage(error, failed))
    } finally {
      setBusy(false)
    }
  }

  async function cancelLogin(): Promise<void> {
    if (!api) return
    setBusy(true)
    try {
      wasPending.current = false
      setStatus(await api.cancelLogin())
      setMessage(t("sub.signInCancelled"))
    } catch (error) {
      setMessage(errorMessage(error, failed))
    } finally {
      setBusy(false)
    }
  }

  async function save(model: string, effort: ClaudeEffort): Promise<void> {
    await window.ohmypaper.saveAiMode({ mode: "claude", claudeModel: model, claudeEffort: effort })
    await changed.current?.()
  }

  async function updateModel(nextModel: string): Promise<void> {
    const previous = selectedModel
    setSelectedModel(nextModel)
    try {
      await save(nextModel, selectedEffort)
    } catch (error) {
      setSelectedModel(previous)
      setMessage(errorMessage(error, failed))
    }
  }

  async function updateEffort(nextEffort: ClaudeEffort): Promise<void> {
    const previous = selectedEffort
    setSelectedEffort(nextEffort)
    try {
      await save(selectedModel, nextEffort)
    } catch (error) {
      setSelectedEffort(previous)
      setMessage(errorMessage(error, failed))
    }
  }

  return {
    supported: api !== undefined,
    status,
    message,
    busy,
    selectedModel,
    selectedEffort,
    isConnected: Boolean(status?.authenticated && !status.loginPending),
    refresh,
    startLogin,
    cancelLogin,
    updateModel,
    updateEffort,
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
