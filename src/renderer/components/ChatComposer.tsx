import { ArrowUp, ImagePlus, Square, X } from "lucide-react"
import { type FormEvent, type JSX, type KeyboardEvent, useRef } from "react"
import type { ChatImage } from "../lib/chatImage"
import { useTranslator } from "../lib/locale"
import { readerMessages } from "../messages/reader"

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
  /** Enables attaching one image by picker, paste or drop. */
  readonly image?: ChatImage | null | undefined
  readonly onImageSelect?: ((file: File) => void) | undefined
  readonly onImageRemove?: (() => void) | undefined
}

function firstImage(files: FileList | null | undefined): File | null {
  return [...(files ?? [])].find((file) => file.type.startsWith("image/")) ?? null
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
  image = null,
  onImageSelect,
  onImageRemove,
}: ChatComposerProps): JSX.Element {
  const t = useTranslator(readerMessages)
  const fileInput = useRef<HTMLInputElement>(null)
  const responseStatus = responseStarted ? t("composer.writing") : t("composer.checking")

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form
      className="chat-composer"
      onSubmit={onSubmit}
      aria-busy={sending}
      onDragOver={
        onImageSelect
          ? (event) => {
              if (![...event.dataTransfer.items].some((item) => item.kind === "file")) return
              event.preventDefault()
              event.stopPropagation()
            }
          : undefined
      }
      onDrop={
        onImageSelect
          ? (event) => {
              const file = firstImage(event.dataTransfer.files)
              if (!file) return
              // PDF.js pastes dropped images into the page as stamps; keep this one in chat.
              event.preventDefault()
              event.stopPropagation()
              onImageSelect(file)
            }
          : undefined
      }
    >
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
      {image ? (
        <div className="chat-composer-attachment">
          <img src={image.dataUrl} alt={t("composer.imageAlt", { name: image.name })} />
          <button type="button" aria-label={t("composer.removeImage")} onClick={onImageRemove}>
            <X size={12} strokeWidth={2.25} />
          </button>
        </div>
      ) : null}
      <textarea
        aria-label={label}
        value={value}
        rows={1}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={submitOnEnter}
        onPaste={
          onImageSelect
            ? (event) => {
                const file = firstImage(event.clipboardData.files)
                if (!file) return
                // A screenshot pastes as a file only; keep any text that came with it.
                if (!event.clipboardData.getData("text/plain")) event.preventDefault()
                event.stopPropagation()
                onImageSelect(file)
              }
            : undefined
        }
      />
      <footer>
        {onImageSelect ? (
          <>
            <button
              type="button"
              className="chat-attach-button"
              aria-label={t("composer.attachImage")}
              title={t("composer.attachImageHint")}
              disabled={sending}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus size={15} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = firstImage(event.currentTarget.files)
                event.currentTarget.value = ""
                if (file) onImageSelect(file)
              }}
            />
          </>
        ) : null}
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
            aria-label={t("composer.stop")}
            onClick={onCancel}
          >
            <Square size={12} strokeWidth={2.25} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={(!value.trim() && !image) || sending}
            aria-label={submitLabel}
          >
            <ArrowUp size={14} strokeWidth={2.25} />
          </button>
        )}
      </footer>
    </form>
  )
}
