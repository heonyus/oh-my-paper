import { ArrowUp, AtSign, FileText, X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import type { DocumentId, DocumentRecord } from "../../shared/schemas"

export function ResearchComposer({
  documents,
  attachedIds,
  sending,
  onAttach,
  onDetach,
  onSend,
}: {
  readonly documents: readonly DocumentRecord[]
  readonly attachedIds: readonly DocumentId[]
  readonly sending: boolean
  readonly onAttach: (id: DocumentId) => void
  readonly onDetach: (id: DocumentId) => void
  readonly onSend: (question: string) => void
}): JSX.Element {
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
        <ul className="research-chips" aria-label="첨부된 논문">
          {attached.map((document) => (
            <li key={document.id} className="research-chip">
              <FileText size={12} aria-hidden="true" />
              <span>{document.title}</span>
              <button
                type="button"
                aria-label={`${document.title} 제거`}
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
        placeholder="연구에 대해 무엇이든 물어보세요… '@'로 논문을 컨텍스트에 추가"
        aria-label="리서치 질문 입력"
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
            aria-label="논문을 컨텍스트에 추가"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <AtSign size={15} aria-hidden="true" />
          </button>
          {pickerOpen ? (
            <ul className="research-picker" aria-label="내 라이브러리 논문">
              {documents.length === 0 ? (
                <li className="research-picker-empty">라이브러리가 비어 있습니다</li>
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
        </div>
        <button
          type="button"
          className="research-send"
          aria-label="질문 보내기"
          disabled={sending || value.trim().length === 0}
          onClick={send}
        >
          <ArrowUp size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
