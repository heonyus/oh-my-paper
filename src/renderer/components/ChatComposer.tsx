import { ArrowUp, Square } from "lucide-react"
import type { FormEvent, JSX, KeyboardEvent } from "react"

type ChatComposerProps = {
  readonly label: string
  readonly submitLabel: string
  readonly value: string
  readonly sending: boolean
  readonly responseStarted?: boolean | undefined
  readonly model?: string | undefined
  readonly onChange: (value: string) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onCancel?: (() => void) | undefined
}

export function ChatComposer({
  label,
  submitLabel,
  value,
  sending,
  responseStarted = false,
  model,
  onChange,
  onSubmit,
  onCancel,
}: ChatComposerProps): JSX.Element {
  const responseStatus = responseStarted ? "답변 작성 중…" : "논문 근거를 확인하는 중…"

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form className="chat-composer" onSubmit={onSubmit} aria-busy={sending}>
      <span
        className="chat-response-status"
        role="status"
        data-active={sending}
        data-phase={responseStarted ? "writing" : "preparing"}
        aria-hidden={!sending}
      >
        <span className="chat-response-status-dot" aria-hidden="true" />
        {responseStatus}
      </span>
      <textarea
        aria-label={label}
        value={value}
        rows={1}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={submitOnEnter}
      />
      <footer>
        {model ? (
          <span className="chat-composer-model" title={model}>
            {model}
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        {sending && onCancel ? (
          <button
            type="button"
            className="chat-cancel-button"
            aria-label="응답 중단"
            onClick={onCancel}
          >
            <Square size={12} strokeWidth={2.25} />
          </button>
        ) : (
          <button type="submit" disabled={!value.trim() || sending} aria-label={submitLabel}>
            <ArrowUp size={14} strokeWidth={2.25} />
          </button>
        )}
      </footer>
    </form>
  )
}
