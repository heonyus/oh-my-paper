import { Loader2, Trash2 } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import type { DocumentRecord } from "../types"

export function LibraryDocumentDelete({
  document,
  confirming,
  onConfirmingChange,
  onDelete,
}: {
  readonly document: DocumentRecord
  readonly confirming: boolean
  readonly onConfirmingChange: (confirming: boolean) => void
  readonly onDelete: (id: DocumentRecord["id"]) => Promise<void>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const confirmation = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!confirming) {
      setError("")
      return
    }
    // The list trash button opens this at the bottom of the detail panel, often off-screen;
    // centring keeps it clear of the task queue docked in the bottom corner.
    confirmation.current?.scrollIntoView?.({ block: "center", behavior: "smooth" })
  }, [confirming])

  async function remove(): Promise<void> {
    setBusy(true)
    setError("")
    try {
      await onDelete(document.id)
      onConfirmingChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "문서를 삭제하지 못했습니다")
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="library-delete-action"
        onClick={() => onConfirmingChange(true)}
      >
        <Trash2 size={15} aria-hidden="true" />
        <span>라이브러리에서 삭제</span>
      </button>
    )
  }
  return (
    <div
      ref={confirmation}
      className="library-delete-confirm"
      role="alertdialog"
      aria-label="문서 삭제 확인"
    >
      <p>
        <strong>이 문서를 삭제할까요?</strong>
        <span>
          PDF 사본, 이 문서의 카드·하이라이트·채팅 기록, 페이지 분석·번역 결과가 함께 지워집니다.
          되돌릴 수 없으며 같은 PDF를 다시 가져오면 분석과 번역을 새로 합니다.
        </span>
      </p>
      {error ? (
        <p className="library-delete-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="library-delete-buttons">
        <button type="button" disabled={busy} onClick={() => onConfirmingChange(false)}>
          취소
        </button>
        <button
          type="button"
          className="library-delete-danger"
          disabled={busy}
          onClick={() => void remove()}
        >
          {busy ? <Loader2 size={14} className="settings-spinner" aria-hidden="true" /> : null}
          삭제
        </button>
      </div>
    </div>
  )
}
