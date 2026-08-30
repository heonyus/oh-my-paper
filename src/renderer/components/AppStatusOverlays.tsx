import type { JSX } from "react"
import type { PreparationUpdate } from "../../shared/ipc"
import { PreparationProgress } from "./PreparationProgress"

export function AppStatusOverlays({
  preparation,
  saveFailed,
  onPreparationClose,
}: {
  readonly preparation: readonly PreparationUpdate[]
  readonly saveFailed: boolean
  readonly onPreparationClose: () => void
}): JSX.Element {
  return (
    <>
      {preparation.length > 0 ? (
        <PreparationProgress updates={preparation} onClose={onPreparationClose} />
      ) : null}
      {saveFailed ? <p className="workspace-save-error">작업 공간을 저장하지 못했습니다.</p> : null}
    </>
  )
}
