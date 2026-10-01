import { Maximize2, Minus, NotebookPen, X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslator } from "../../lib/locale"
import { NOTE_CARD_MAX_CHARACTERS, type NoteCardTarget } from "../../lib/noteCard"
import type { NoteCardState } from "../../lib/useNoteCard"
import { noteMessages } from "../../messages/note"
import { useCardPlacement } from "./useCardPlacement"

const APPLE = /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? "")
const SAVE_KEYS = APPLE ? ["⌘", "↵"] : ["Ctrl", "↵"]

/**
 * The note card and the short confirmation after it is added to a note. On a paper the card is
 * pinned to the board where it opened and scrolls with the pages; elsewhere it floats on the
 * screen. It stays faint while the reader is elsewhere and comes forward when pressed.
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
  const input = useRef<HTMLTextAreaElement>(null)
  const { openTarget, saved, focusRequest } = state
  const position = useCardPlacement(openTarget !== null, openTarget?.kind === "paper", state.close)
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
  // A card kept from last time continues where its text ends.
  const placed = position.placed
  useEffect(() => {
    const field = input.current
    if (!isOpen || !placed || focusRequest === 0 || !field) return
    field.focus({ preventScroll: true })
    field.setSelectionRange(field.value.length, field.value.length)
  }, [isOpen, placed, focusRequest])

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

  if (!position.style && position.following) return null
  const destination =
    openTarget.kind === "paper"
      ? t("card.paperTarget", { page: openTarget.page, title: openTarget.title })
      : t("card.looseTarget")
  const element = (
    <section
      ref={card}
      className="note-card"
      data-placement={position.world ? "board" : position.style ? "point" : "corner"}
      data-following={position.following}
      data-minimized={minimized}
      aria-label={t("card.label")}
      style={position.style}
      onPointerDown={(event) => {
        // Pressing anywhere on the card brings it forward and back to writing.
        event.stopPropagation()
        if (event.target instanceof Element && event.target.closest("button, textarea")) return
        input.current?.focus({ preventScroll: true })
      }}
      onWheel={(event) => event.stopPropagation()}
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
          onClick={state.close}
        >
          <X size={15} />
        </button>
      </header>
      <textarea
        ref={input}
        className="note-card-input"
        aria-label={t("card.content")}
        placeholder={t("card.placeholder")}
        maxLength={NOTE_CARD_MAX_CHARACTERS}
        value={state.draft}
        onChange={(event) => state.setDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            state.save(position.pin)
          } else if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            state.close()
          }
        }}
      />
      {state.full ? (
        <p className="note-card-error" role="alert">
          {t("card.full")}
        </p>
      ) : null}
      <footer className="note-card-foot">
        <span className="note-card-keys" aria-hidden="true">
          {SAVE_KEYS.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
        </span>
      </footer>
    </section>
  )
  return position.world ? createPortal(element, position.world) : element
}
