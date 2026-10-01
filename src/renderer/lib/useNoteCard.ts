import { useCallback, useEffect, useRef, useState } from "react"
import type { DocumentId } from "../../shared/schemas"
import {
  isNoteCardShortcut,
  type NoteCardTarget,
  noteCardMarkdown,
  noteCardNoteId,
} from "./noteCard"

const SAVED_VISIBLE_MS = 4_000

export type NoteCardSaved = { readonly id: number; readonly target: NoteCardTarget }

/**
 * The note card: `N` or `⌥N` opens it on any screen, aimed at whatever is in view (the open
 * paper at its page, or the loose note). Every card starts empty and closing discards it; saving
 * appends it to that note.
 */
/** A board point a card added on a paper stays at, as a card the reader can keep reading. */
export type NoteCardPin = { readonly x: number; readonly y: number }

export function useNoteCard(
  target: NoteCardTarget,
  onAppend: (noteId: DocumentId, card: string) => boolean,
  /** Leaves an added card on the paper's board where it was written. */
  onPin: (
    target: NoteCardTarget & { readonly kind: "paper" },
    text: string,
    at: NoteCardPin,
  ) => void,
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

  const open = useCallback((): void => {
    setOpenTarget((current) => {
      // Each card starts empty; a second N only brings the open one back to writing.
      if (current === null) setDraftState("")
      return current ?? targetRef.current
    })
    setFocusRequest((request) => request + 1)
    setSaved(null)
  }, [])
  const close = useCallback((): void => {
    setOpenTarget(null)
    setDraftState("")
    setFull(false)
  }, [])
  const setDraft = useCallback((next: string): void => {
    setDraftState(next)
    setFull(false)
  }, [])
  const save = useCallback(
    (at: NoteCardPin | null): void => {
      const text = draft.trim()
      if (!openTarget || !text) return
      if (!onAppend(noteCardNoteId(openTarget), noteCardMarkdown(text, openTarget))) {
        setFull(true)
        return
      }
      setDraft("")
      setOpenTarget(null)
      // On a paper the card stays where it was written; elsewhere a short confirmation shows.
      if (openTarget.kind === "paper" && at) onPin(openTarget, text, at)
      else setSaved({ id: Date.now(), target: openTarget })
    },
    [draft, openTarget, onAppend, onPin, setDraft],
  )
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

  return { openTarget, draft, full, focusRequest, saved, open, close, setDraft, save, dismissSaved }
}

export type NoteCardState = ReturnType<typeof useNoteCard>
