import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"
import { type PreparationUpdate, type ProviderStatus, preparationSteps } from "../../shared/ipc"
import { DEFAULT_OPENROUTER_MODEL } from "../../shared/providerModels"
import type { Workspace } from "../../shared/schemas"
import { chromeMessages } from "../messages/chrome"
import { normalizeWorkspaceTranslations } from "./cardPresentation"
import { useTranslator } from "./locale"
import { settleInterruptedCards } from "./structureCardState"

export const initialProviderStatus: ProviderStatus = {
  mode: "chatgpt",
  configured: false,
  provider: "openrouter",
  model: DEFAULT_OPENROUTER_MODEL,
}

export const initialOcrProviderStatus: DocumentOcrProviderStatus = {
  configured: false,
  provider: "paddle",
  model: "PaddleOCR-VL-1.6",
  acceleration: null,
}

export function useAppBootstrap({
  preparation,
  resetWorkspace,
  setPreparation,
  setProvider,
  setOcrStatus,
  setCredentialsChecked,
  setBootstrapError,
}: {
  readonly preparation: readonly PreparationUpdate[]
  readonly resetWorkspace: (workspace: Workspace) => void
  readonly setPreparation: Dispatch<SetStateAction<PreparationUpdate[]>>
  readonly setProvider: Dispatch<SetStateAction<ProviderStatus>>
  readonly setOcrStatus: Dispatch<SetStateAction<DocumentOcrProviderStatus>>
  readonly setCredentialsChecked: Dispatch<SetStateAction<boolean>>
  readonly setBootstrapError?: Dispatch<SetStateAction<string | null>>
}): void {
  const t = useTranslator(chromeMessages)
  // Read when a failure arrives, so a language switch does not restart the bootstrap.
  const startFailed = useRef(t("status.startFailed"))
  useEffect(() => {
    startFailed.current = t("status.startFailed")
  }, [t])
  const report = useCallback(
    (error: unknown): void => {
      setBootstrapError?.(error instanceof Error ? error.message : startFailed.current)
    },
    [setBootstrapError],
  )
  useEffect(() => {
    void window.ohmypaper
      .readWorkspace()
      .then(normalizeWorkspaceTranslations)
      // Only at start: a reload during a session may meet a card still being generated.
      .then(settleInterruptedCards)
      .then(resetWorkspace)
      .catch(report)
    void Promise.all([
      window.ohmypaper.providerStatus().then(setProvider),
      window.ohmypaper.documentOcrStatus().then(setOcrStatus),
    ])
      .catch(report)
      .finally(() => setCredentialsChecked(true))
    return window.ohmypaper.onPreparation((update) => {
      setPreparation((current) => [...current.filter((item) => item.step !== update.step), update])
    })
  }, [resetWorkspace, setCredentialsChecked, setOcrStatus, setPreparation, setProvider, report])

  useEffect(() => {
    const complete =
      preparation.length === preparationSteps.length &&
      preparation.every((update) => update.state === "complete")
    if (!complete) return
    const timer = window.setTimeout(() => setPreparation([]), 1_600)
    return () => window.clearTimeout(timer)
  }, [preparation, setPreparation])
}
