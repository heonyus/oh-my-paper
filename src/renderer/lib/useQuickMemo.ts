import { useCallback, useRef } from "react"
import type { Locale } from "../../shared/i18n/locale"
import type { DocumentId } from "../../shared/schemas"
import type { BoardCard, DocumentRecord } from "../types"
import { createPinnedNoteCard } from "./board"
import { type NoteCardTarget, noteCardMarkdown, noteCardNoteId } from "./noteCard"
import { trackQuickMemo } from "./quickMemos"
import type { NoteCardPin } from "./useNoteCard"

type QuickMemoApp = {
  readonly activeDocument: Pick<DocumentRecord, "id"> | null
  readonly activeCards: readonly BoardCard[]
  readonly updateCards: (cards: readonly BoardCard[]) => void
  readonly appendToNote: (noteId: DocumentId, card: string) => boolean
}

/**
 * What `N` does over a paper: an empty memo on its board at the pointer, written in place.
 * Once the reader leaves the memo, what they wrote also joins that page's note; a memo left
 * empty is taken away again.
 */
export function useQuickMemo(
  app: QuickMemoApp,
  locale: Locale,
): (target: NoteCardTarget & { readonly kind: "paper" }, at: NoteCardPin) => void {
  const latest = useRef(app)
  latest.current = app
  return useCallback(
    (target, at) => {
      if (target.documentId !== latest.current.activeDocument?.id) return
      const memo = createPinnedNoteCard(target.documentId, target.page, at, "", locale)
      trackQuickMemo(memo.id, (body) => {
        const text = body.trim()
        if (!text) return "discard"
        latest.current.appendToNote(noteCardNoteId(target), noteCardMarkdown(text, target))
        return "keep"
      })
      latest.current.updateCards([...latest.current.activeCards, memo])
    },
    [locale],
  )
}
