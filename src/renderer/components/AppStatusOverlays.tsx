import type { JSX } from "react"
import type { PreparationUpdate } from "../../shared/ipc"
import { useTranslator } from "../lib/locale"
import { chromeMessages } from "../messages/chrome"
import { PreparationProgress } from "./PreparationProgress"

export function AppStatusOverlays({
  preparation,
  saveFailed,
  bootstrapError,
  onPreparationClose,
}: {
  readonly preparation: readonly PreparationUpdate[]
  readonly saveFailed: boolean
  readonly bootstrapError?: string | null
  readonly onPreparationClose: () => void
}): JSX.Element {
  const t = useTranslator(chromeMessages)
  return (
    <>
      {preparation.length > 0 ? (
        <PreparationProgress updates={preparation} onClose={onPreparationClose} />
      ) : null}
      {saveFailed ? <p className="workspace-save-error">{t("status.saveFailed")}</p> : null}
      {bootstrapError ? (
        <p className="workspace-save-error" role="alert">
          {bootstrapError}
        </p>
      ) : null}
    </>
  )
}
