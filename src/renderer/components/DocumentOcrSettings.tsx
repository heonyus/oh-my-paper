import { Check } from "lucide-react"
import { type Dispatch, type FormEvent, type JSX, type SetStateAction, useState } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"

export function DocumentOcrSettings({
  status,
  form,
  onSave,
}: {
  readonly status: DocumentOcrProviderStatus
  readonly form: DocumentOcrFormState
  readonly onSave: (key: string) => Promise<void>
}): JSX.Element {
  const { key, setKey, message, setMessage } = form

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await onSave(key)
      setKey("")
      setMessage("저장됨")
    } catch (error) {
      if (!(error instanceof Error)) throw error
      setMessage("저장 실패")
    }
  }

  return (
    <form className="settings-ai-form" onSubmit={(event) => void submit(event)}>
      <div className="settings-group">
        <label className="settings-row settings-provider-row" htmlFor="mistral-ocr-key">
          <span>
            <strong>Mistral OCR</strong>
            <small>
              {status.configured ? `${status.model} · 연결 준비됨` : "API 키 설정 필요"}
            </small>
          </span>
          <input
            id="mistral-ocr-key"
            aria-label="Mistral OCR API 키"
            type="password"
            autoComplete="off"
            value={key}
            placeholder="Mistral API 키"
            onChange={(event) => setKey(event.currentTarget.value)}
          />
        </label>
      </div>
      <div className="settings-form-footer">
        {message ? (
          <span role="status">
            <Check size={13} /> {message}
          </span>
        ) : (
          <span />
        )}
        <button className="settings-save" type="submit" disabled={key.trim().length < 20}>
          OCR 키 저장
        </button>
      </div>
    </form>
  )
}

export type DocumentOcrFormState = {
  readonly key: string
  readonly setKey: Dispatch<SetStateAction<string>>
  readonly message: string
  readonly setMessage: Dispatch<SetStateAction<string>>
}

export function useDocumentOcrForm(): DocumentOcrFormState {
  const [key, setKey] = useState("")
  const [message, setMessage] = useState("")
  return { key, setKey, message, setMessage }
}
