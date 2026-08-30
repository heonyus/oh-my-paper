import { ArrowUp } from "lucide-react"
import type { FormEvent, JSX, KeyboardEvent } from "react"

type ChatComposerProps = {
  readonly label: string
  readonly submitLabel: string
  readonly value: string
  readonly sending: boolean
  readonly model?: string | undefined
  readonly onChange: (value: string) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ChatComposer({
  label,
  submitLabel,
  value,
  sending,
  model,
  onChange,
  onSubmit,
}: ChatComposerProps): JSX.Element {
  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form className="chat-composer" onSubmit={onSubmit} aria-busy={sending}>
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
        <button type="submit" disabled={!value.trim() || sending} aria-label={submitLabel}>
          <ArrowUp size={14} strokeWidth={2.25} />
        </button>
      </footer>
    </form>
  )
}
