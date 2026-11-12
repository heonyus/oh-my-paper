import { Maximize2, Minus, NotebookPen, X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import { useTranslator } from "../../lib/locale"
import { NOTE_CARD_MAX_CHARACTERS, type NoteCardTarget } from "../../lib/noteCard"
import type { NoteCardState } from "../../lib/useNoteCard"
import { noteMessages } from "../../messages/note"
import { MemoEditor } from "../MemoEditor"
import { useCardPlacement } from "./useCardPlacement"

/**
 * The floating note card and the short confirmation after it is added to a note. It opens where
 * the pointer was, shows its Markdown as it is written, and keeps what was written when it is
 * closed: the close button, `Esc` and `⌘↵` all add the text to the note. An empty card just
 * closes. Over a paper `N` puts a memo on the board instead; see useNoteCard.
 */
export function NoteCardLayer({
  state,
  onOpenNote,
}: {
  readonly state: NoteCardState
  readonly onOpenNote: (target: NoteCardTarget) => void
}): JSX.Element | null {
  const t = useTranslator(noteMessages)
  const card = useRef<HTMLElement>(null)
  const { openTarget, saved, focusRequest } = state
  const position = useCardPlacement(openTarget !== null)
  const [minimized, setMinimized] = useState(false)

  // Focus returns to where the reader was once the card closes.
  const returnFocus = useRef<HTMLElement | null>(null)
  const isOpen = openTarget !== null
  useEffect(() => {
    if (!isOpen) return
    setMinimized(false)
    returnFocus.current =
      document.activeElement instanceof HTMLElement &&
      !card.current?.contains(document.activeElement)
        ? document.activeElement
        : null
    return () => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
    }
  }, [isOpen])

  if (!openTarget) {
    if (!saved) return null
    return (
      <div className="note-card-saved" role="status">
        <span>
          {saved.target.kind === "paper"
            ? t("card.savedPaper", { page: saved.target.page })
            : t("card.savedLoose")}
        </span>
        <button
          type="button"
          onClick={() => {
            state.dismissSaved()
            onOpenNote(saved.target)
          }}
        >
          {t("card.open")}
        </button>
      </div>
    )
  }

  const destination =
    openTarget.kind === "paper"
      ? t("card.paperTarget", { page: openTarget.page, title: openTarget.title })
      : t("card.looseTarget")
  return (
    <section
      ref={card}
      className="note-card"
      data-placement={position.style ? "point" : "corner"}
      data-minimized={minimized}
      aria-label={t("card.label")}
      style={position.style}
      onPointerDown={(event) => {
        // Pressing anywhere on the card brings it forward and back to writing.
        event.stopPropagation()
        if (event.target instanceof Element && event.target.closest("button, .ProseMirror")) return
        card.current?.querySelector<HTMLElement>(".ProseMirror")?.focus({ preventScroll: true })
      }}
    >
      <header className="note-card-head" {...position.handle}>
        <NotebookPen size={15} aria-hidden="true" />
        <span className="note-card-target" title={destination}>
          {destination}
        </span>
        <button
          type="button"
          className="note-card-close"
          aria-label={t(minimized ? "card.expand" : "card.minimize")}
          onClick={() => setMinimized((value) => !value)}
        >
          {minimized ? <Maximize2 size={14} /> : <Minus size={15} />}
        </button>
        <button
          type="button"
          className="note-card-close"
          aria-label={t("card.close")}
          title={t("card.closeHint")}
          onClick={state.close}
        >
          <X size={15} />
        </button>
      </header>
      <div className="note-card-input">
        <MemoEditor
          markdown={state.draft}
          onChange={state.setDraft}
          placeholder={t("card.placeholder")}
          ariaLabel={t("card.content")}
          maxLength={NOTE_CARD_MAX_CHARACTERS}
          focusRequest={position.placed ? focusRequest : 0}
          onSubmit={state.close}
          onEscape={state.close}
        />
      </div>
      {state.full ? (
        <p className="note-card-error" role="alert">
          {t("card.full")}
        </p>
      ) : null}
    </section>
  )
}
