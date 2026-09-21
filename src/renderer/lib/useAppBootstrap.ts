import { type Dispatch, type SetStateAction, useCallback, useEffect } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"
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
  provider: "paddle",
  model: "PaddleOCR-VL-1.6",
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
    void Promise.all([
      window.scourgify.providerStatus().then(setProvider),
      window.scourgify.documentOcrStatus().then(setOcrStatus),
    ])
      .catch(report)
      .finally(() => setCredentialsChecked(true))
    return window.scourgify.onPreparation((update) => {
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
