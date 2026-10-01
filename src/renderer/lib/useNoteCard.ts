import { useCallback, useEffect, useRef, useState } from "react"
import type { DocumentId } from "../../shared/schemas"
import {
  isNoteCardShortcut,
  type NoteCardTarget,
  noteCardMarkdown,
  noteCardNoteId,
} from "./noteCard"

const DRAFT_KEY = "ohmypaper:note-card-draft"
const SAVED_VISIBLE_MS = 4_000

function storedDraft(): string {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? ""
  } catch {
    return ""
  }
}

function storeDraft(draft: string): void {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, draft)
    else window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Without storage an unsaved card lasts until the page is closed.
  }
}

export type NoteCardSaved = { readonly id: number; readonly target: NoteCardTarget }

/**
 * The note card: `N` or `⌥N` opens it on any screen, aimed at whatever is in view (the open
 * paper at its page, or the loose note). Closing keeps what was written for next time; saving
 * appends it to that note and leaves a short confirmation.
 */
export function useNoteCard(
  target: NoteCardTarget,
  onAppend: (noteId: DocumentId, card: string) => boolean,
  /** False while the app has nothing to write into yet (loading, first-run screens). */
  enabled = true,
) {
  const [openTarget, setOpenTarget] = useState<NoteCardTarget | null>(null)
  const [draft, setDraftState] = useState(storedDraft)
  const [full, setFull] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [saved, setSaved] = useState<NoteCardSaved | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target

  const open = useCallback((): void => {
    setOpenTarget((current) => current ?? targetRef.current)
    setFocusRequest((request) => request + 1)
    setSaved(null)
  }, [])
  const close = useCallback((): void => {
    setOpenTarget(null)
    setFull(false)
  }, [])
  const setDraft = useCallback((next: string): void => {
    setDraftState(next)
    setFull(false)
    storeDraft(next)
  }, [])
  const save = useCallback((): void => {
    const text = draft.trim()
    if (!openTarget || !text) return
    if (!onAppend(noteCardNoteId(openTarget), noteCardMarkdown(text, openTarget))) {
      setFull(true)
      return
    }
    setDraft("")
    setOpenTarget(null)
    setSaved({ id: Date.now(), target: openTarget })
  }, [draft, openTarget, onAppend, setDraft])
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
