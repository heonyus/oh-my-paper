import { type JSX, useEffect, useRef, useState } from "react"
import { useTranslator } from "../lib/locale"
import { noteMessages } from "../messages/note"
import type { BoardCard } from "../types"
import { MarkdownContent } from "./MarkdownContent"

/** The fixed body annotation cards had before they became editable memos. */
const LEGACY_NOTE_BODY = "이 구절에 연결된 메모입니다."

export function noteCardBody(card: BoardCard): string {
  return card.body === LEGACY_NOTE_BODY ? "" : card.body
}

/** A memo card left on the board beside its passage; the reader edits it in place. */
export function NoteCardBody({
  card,
  autoEdit,
  onBodyChange,
}: {
  readonly card: BoardCard
  readonly autoEdit: boolean
  readonly onBodyChange: (body: string) => void
}): JSX.Element {
  const t = useTranslator(noteMessages)
  const body = noteCardBody(card)
  const [editing, setEditing] = useState(autoEdit || body.trim() === "")
  const [draft, setDraft] = useState(body)
  const editor = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing) editor.current?.focus()
  }, [editing])

  function finishEditing(): void {
    if (draft !== body) onBodyChange(draft)
    if (draft.trim()) setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        ref={editor}
        className="post-it-editor note-card-editor"
        aria-label={t("memo.content")}
        value={draft}
        placeholder={t("memo.placeholder")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finishEditing}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.currentTarget.blur()
          } else if (event.key === "Escape" && body.trim()) {
            setDraft(body)
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <button
      type="button"
      className="card-markdown post-it-preview"
      aria-label={t("memo.edit")}
      onDoubleClick={() => {
        setDraft(body)
        setEditing(true)
      }}
    >
      <MarkdownContent source={body} />
    </button>
  )
}
