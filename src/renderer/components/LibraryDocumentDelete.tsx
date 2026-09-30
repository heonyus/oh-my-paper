import { Loader2, Trash2 } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import { useTranslator } from "../lib/locale"
import { libraryMessages } from "../messages/library"
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
  const t = useTranslator(libraryMessages)
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
      setError(cause instanceof Error ? cause.message : t("delete.failed"))
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
        <span>{t("delete.action")}</span>
      </button>
    )
  }
  return (
    <div
      ref={confirmation}
      className="library-delete-confirm"
      role="alertdialog"
      aria-label={t("delete.confirmLabel")}
    >
      <p>
        <strong>{t("delete.confirmTitle")}</strong>
        <span>{t("delete.confirmBody")}</span>
      </p>
      {error ? (
        <p className="library-delete-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="library-delete-buttons">
        <button type="button" disabled={busy} onClick={() => onConfirmingChange(false)}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="library-delete-danger"
          disabled={busy}
          onClick={() => void remove()}
        >
          {busy ? <Loader2 size={14} className="settings-spinner" aria-hidden="true" /> : null}
          {t("delete.confirm")}
        </button>
      </div>
    </div>
  )
}
