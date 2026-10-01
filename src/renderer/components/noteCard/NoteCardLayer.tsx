import { NotebookPen, X } from "lucide-react"
import { type JSX, useEffect, useRef } from "react"
import { useTranslator } from "../../lib/locale"
import { NOTE_CARD_MAX_CHARACTERS, type NoteCardTarget } from "../../lib/noteCard"
import type { NoteCardState } from "../../lib/useNoteCard"
import { noteMessages } from "../../messages/note"
import { useCardPosition } from "./useCardPosition"

const APPLE = /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? "")
const SAVE_KEYS = APPLE ? ["⌘", "↵"] : ["Ctrl", "↵"]

/**
 * The note card, floating over whichever screen is open, and the short confirmation after it
 * is added to a note. Reading and scrolling go on underneath while it is open.
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
  const position = useCardPosition(card)
  const { openTarget, saved, focusRequest } = state

  // Focus returns to where the reader was once the card closes.
  const returnFocus = useRef<HTMLElement | null>(null)
  const isOpen = openTarget !== null
  useEffect(() => {
    if (!isOpen) return
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
  useEffect(() => {
    const field = input.current
    if (!isOpen || focusRequest === 0 || !field) return
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  }, [isOpen, focusRequest])

  if (!openTarget) {
    if (!saved) return null
    return (
      <div className="note-card-saved" role="status" style={position.style}>
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
    <section ref={card} className="note-card" aria-label={t("card.label")} style={position.style}>
      <header className="note-card-head" {...position.handle}>
        <NotebookPen size={15} aria-hidden="true" />
        <span className="note-card-target" title={destination}>
          {destination}
        </span>
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
            state.save()
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
        <button
          type="button"
          className="primary-action"
          disabled={!state.draft.trim()}
          onClick={state.save}
        >
          {t("card.save")}
        </button>
      </footer>
    </section>
  )
}
