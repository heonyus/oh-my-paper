import { ArrowUp, AtSign, FileText, Square, Telescope, X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import { useTranslator } from "../../renderer/lib/locale"
import type { AgentMode } from "../../shared/agentChat"
import type { DocumentId, DocumentRecord } from "../../shared/schemas"
import { researchViewMessages } from "./messages"

export function ResearchComposer({
  documents,
  attachedIds,
  sending,
  mode,
  onModeChange,
  onAttach,
  onDetach,
  onSend,
  onCancel,
}: {
  readonly documents: readonly DocumentRecord[]
  readonly attachedIds: readonly DocumentId[]
  readonly sending: boolean
  readonly mode: AgentMode
  readonly onModeChange: (mode: AgentMode) => void
  readonly onAttach: (id: DocumentId) => void
  readonly onDetach: (id: DocumentId) => void
  readonly onSend: (question: string) => void
  readonly onCancel: () => void
}): JSX.Element {
  const t = useTranslator(researchViewMessages)
  const [value, setValue] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const attached = attachedIds
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is DocumentRecord => Boolean(document))

  useEffect(() => {
    if (!pickerOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setPickerOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [pickerOpen])

  const send = (): void => {
    const question = value.trim()
    if (!question || sending) return
    setValue("")
    onSend(question)
  }

  return (
    <div className="research-composer" ref={rootRef}>
      {attached.length > 0 ? (
        <ul className="research-chips" aria-label={t("composer.attached")}>
          {attached.map((document) => (
            <li key={document.id} className="research-chip">
              <FileText size={12} aria-hidden="true" />
              <span>{document.title}</span>
              <button
                type="button"
                aria-label={t("composer.remove", { title: document.title })}
                onClick={() => onDetach(document.id)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        value={value}
        rows={2}
        placeholder={mode === "deep" ? t("composer.placeholderDeep") : t("composer.placeholder")}
        aria-label={t("composer.inputLabel")}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            send()
          }
        }}
      />
      <div className="research-composer-bar">
        <div className="research-composer-actions">
          <button
            type="button"
            className="research-attach"
            aria-label={t("composer.attach")}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <AtSign size={15} aria-hidden="true" />
          </button>
          {pickerOpen ? (
            <ul className="research-picker" aria-label={t("composer.library")}>
              {documents.length === 0 ? (
                <li className="research-picker-empty">{t("composer.libraryEmpty")}</li>
              ) : (
                documents.map((document) => (
                  <li key={document.id}>
                    <button
                      type="button"
                      disabled={attachedIds.includes(document.id)}
                      onClick={() => {
                        onAttach(document.id)
                        setPickerOpen(false)
                      }}
                    >
                      {document.title}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
          <button
            type="button"
            className="research-mode-toggle"
            aria-pressed={mode === "deep"}
            disabled={sending}
            title={t("composer.deepTitle")}
            onClick={() => onModeChange(mode === "deep" ? "quick" : "deep")}
          >
            <Telescope size={14} aria-hidden="true" />
            {t("composer.deep")}
          </button>
        </div>
        {sending ? (
          <button
            type="button"
            className="research-send research-cancel"
            aria-label={t("composer.cancel")}
            onClick={onCancel}
          >
            <Square size={13} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="research-send"
            aria-label={mode === "deep" ? t("composer.startDeep") : t("composer.send")}
            disabled={value.trim().length === 0}
            onClick={send}
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
