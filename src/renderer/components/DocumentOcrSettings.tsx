import { Check } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"

export function DocumentOcrSettings({
  status,
  onSave,
}: {
  readonly status: DocumentOcrProviderStatus
  readonly onSave: (key: string) => Promise<void>
}): JSX.Element {
  const [key, setKey] = useState("")
  const [message, setMessage] = useState("")

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
    <div className="settings-ai-stack">
      <fieldset className="settings-group">
        <legend>로컬 PDF 분석</legend>
        <div className="settings-row">
          <span>
            <strong>{status.model}</strong>
            <small>가져온 문서를 먼저 분석하고 검사합니다.</small>
          </span>
          <strong>{status.configured ? "로컬 런타임 준비됨" : "로컬 런타임 설치 필요"}</strong>
        </div>
      </fieldset>
      <form className="settings-ai-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="settings-group">
          <legend>최종 OCR 폴백</legend>
          <label className="settings-row settings-provider-row" htmlFor="mistral-ocr-key">
            <span>
              <strong>Mistral OCR 4.1</strong>
              <small>
                {status.fallback?.configured
                  ? "로컬 분석 2회 실패 시 사용 준비됨"
                  : "선택 사항 · 사용량에 따라 Mistral 비용 발생"}
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
        </fieldset>
        <div className="settings-form-footer">
          {message ? (
            <span role="status">
              <Check size={13} /> {message}
            </span>
          ) : (
            <span />
          )}
          <button className="settings-save" type="submit" disabled={key.trim().length < 20}>
            폴백 키 저장
          </button>
        </div>
      </form>
    </div>
  )
}
