import { useCallback, useEffect, useRef, useState } from "react"
import type { DocumentId } from "../../shared/schemas"
import { noteCardPlacement, type ScreenPoint } from "../components/noteCard/noteCardPlacement"
import {
  isNoteCardShortcut,
  type NoteCardTarget,
  noteCardMarkdown,
  noteCardNoteId,
} from "./noteCard"

const SAVED_VISIBLE_MS = 4_000

export type NoteCardSaved = { readonly id: number; readonly target: NoteCardTarget }

/**
 * The note card: `N` or `⌥N` opens it on any screen, aimed at whatever is in view. Over a paper
 * a memo appears on the board at the pointer and is written in place; it needs no saving.
 * Elsewhere a card floats on the screen for the loose note, and closing it keeps what was
 * written.
 */
/** A board point a memo opened over a paper sits at. */
export type NoteCardPin = { readonly x: number; readonly y: number }

export function useNoteCard(
  target: NoteCardTarget,
  onAppend: (noteId: DocumentId, card: string) => boolean,
  /** Puts an empty memo on the paper's board at `at`, with the caret in it. */
  onMemo: (target: NoteCardTarget & { readonly kind: "paper" }, at: NoteCardPin) => void,
  /** False while the app has nothing to write into yet (loading, first-run screens). */
  enabled = true,
) {
  const [openTarget, setOpenTarget] = useState<NoteCardTarget | null>(null)
  const [draft, setDraftState] = useState("")
  const [full, setFull] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [saved, setSaved] = useState<NoteCardSaved | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target
  // The card's text as last reported, ahead of the render that shows it.
  const draftRef = useRef("")
  const pointer = useRef<ScreenPoint | null>(null)

  useEffect(() => {
    const track = (event: PointerEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener("pointermove", track, { passive: true })
    return () => window.removeEventListener("pointermove", track)
  }, [])

  const open = useCallback((): void => {
    const aim = targetRef.current
    const at = aim.kind === "paper" ? noteCardPlacement(true, pointer.current) : null
    if (aim.kind === "paper" && at?.kind === "board") {
      onMemo(aim, { x: at.x, y: at.y })
      return
    }
    setOpenTarget((current) => {
      // Each card starts empty; a second N only brings the open one back to writing.
      if (current === null) {
        draftRef.current = ""
        setDraftState("")
      }
      return current ?? aim
    })
    setFocusRequest((request) => request + 1)
    setSaved(null)
  }, [onMemo])
  const discard = useCallback((): void => {
    setOpenTarget(null)
    draftRef.current = ""
    setDraftState("")
    setFull(false)
  }, [])
  const setDraft = useCallback((next: string): void => {
    draftRef.current = next
    setDraftState(next)
    setFull(false)
  }, [])
  /** Closes the card. What was written goes to the note; an empty card just goes away. */
  const close = useCallback((): void => {
    const text = draftRef.current.trim()
    if (!openTarget || !text) {
      discard()
      return
    }
    if (!onAppend(noteCardNoteId(openTarget), noteCardMarkdown(text, openTarget))) {
      // The first close says the note is full and keeps the text; closing again lets it go.
      if (full) discard()
      else setFull(true)
      return
    }
    discard()
    setSaved({ id: Date.now(), target: openTarget })
  }, [openTarget, onAppend, discard, full])
  const dismissSaved = useCallback(() => setSaved(null), [])

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(null), SAVED_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [saved])

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !isNoteCardShortcut(event)) return
      event.preventDefault()
      open()
    }
    // Capture, so ⌥N reaches the card before an editor types a character for it.
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [enabled, open])

  return { openTarget, draft, full, focusRequest, saved, open, close, setDraft, dismissSaved }
}

export type NoteCardState = ReturnType<typeof useNoteCard>
