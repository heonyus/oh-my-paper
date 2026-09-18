import { type Dispatch, type SetStateAction, useCallback, useEffect } from "react"
import { type DocumentOcrProviderStatus, MISTRAL_OCR_MODEL } from "../../shared/documentOcr"
import { type PreparationUpdate, type ProviderStatus, preparationSteps } from "../../shared/ipc"
import type { Workspace } from "../../shared/schemas"
import { normalizeWorkspaceTranslations } from "./cardPresentation"

export const initialProviderStatus: ProviderStatus = {
  mode: "chatgpt",
  configured: false,
  provider: "openrouter",
  model: "google/gemini-2.5-flash-lite",
}

export const initialOcrProviderStatus: DocumentOcrProviderStatus = {
  configured: false,
  provider: "mistral",
  model: MISTRAL_OCR_MODEL,
}

export function useAppBootstrap({
  preparation,
  resetWorkspace,
  setPreparation,
  setProvider,
  setOcrStatus,
  setBootstrapError,
}: {
  readonly preparation: readonly PreparationUpdate[]
  readonly resetWorkspace: (workspace: Workspace) => void
  readonly setPreparation: Dispatch<SetStateAction<PreparationUpdate[]>>
  readonly setProvider: Dispatch<SetStateAction<ProviderStatus>>
  readonly setOcrStatus: Dispatch<SetStateAction<DocumentOcrProviderStatus>>
  readonly setBootstrapError?: Dispatch<SetStateAction<string | null>>
}): void {
  const report = useCallback(
    (error: unknown): void => {
      setBootstrapError?.(error instanceof Error ? error.message : "앱 시작에 실패했습니다.")
    },
    [setBootstrapError],
  )
  useEffect(() => {
    void window.scourgify
      .readWorkspace()
      .then(normalizeWorkspaceTranslations)
      .then(resetWorkspace)
      .catch(report)
    void window.scourgify.providerStatus().then(setProvider).catch(report)
    void window.scourgify.documentOcrStatus().then(setOcrStatus).catch(report)
    return window.scourgify.onPreparation((update) => {
      setPreparation((current) => [...current.filter((item) => item.step !== update.step), update])
    })
  }, [resetWorkspace, setOcrStatus, setPreparation, setProvider, report])

  useEffect(() => {
    const complete =
      preparation.length === preparationSteps.length &&
      preparation.every((update) => update.state === "complete")
    if (!complete) return
    const timer = window.setTimeout(() => setPreparation([]), 1_600)
    return () => window.clearTimeout(timer)
  }, [preparation, setPreparation])
}
