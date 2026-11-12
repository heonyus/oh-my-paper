import type { JSX } from "react"
import { useTranslator } from "../lib/locale"
import { noteMessages } from "../messages/note"
import type { BoardCard } from "../types"
import { MemoEditor } from "./MemoEditor"

/** The fixed body annotation cards had before they became editable memos. */
const LEGACY_NOTE_BODY = "이 구절에 연결된 메모입니다."

export function noteCardBody(card: BoardCard): string {
  return card.body === LEGACY_NOTE_BODY ? "" : card.body
}

/** A memo card left on the board beside its passage, written in place and shown rendered. */
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
  return (
    <MemoEditor
      markdown={noteCardBody(card)}
      onChange={onBodyChange}
      placeholder={t("memo.placeholder")}
      ariaLabel={t("memo.content")}
      autoFocus={autoEdit}
    />
  )
}
