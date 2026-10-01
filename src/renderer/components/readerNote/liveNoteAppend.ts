import { Selection } from "@tiptap/pm/state"
import type { Editor } from "@tiptap/react"
import { appendNoteCard, noteCardAddition } from "../../lib/noteCard"
import type { LiveNoteAppender } from "../../lib/useReaderNote"

/**
 * Adds a note card to the end of a note open in its editor, so the editor never overwrites it,
 * and scrolls it into view without taking focus from where the reader is.
 */
export function appendCardToEditor(editor: Editor, card: string): boolean {
  if (appendNoteCard(editor.getMarkdown(), card) === null) return false
  const end = editor.state.doc.content.size
  const empty = editor.isEmpty
  return editor
    .chain()
    .insertContentAt(empty ? { from: 0, to: end } : end, noteCardAddition(empty, card), {
      contentType: "markdown",
    })
    .command(({ tr }) => {
      tr.setSelection(Selection.atEnd(tr.doc))
      return true
    })
    .scrollIntoView()
    .run()
}

/**
 * Note cards for an open editor. The note is saved as soon as the card is in, without the pause
 * typing waits for: adding a card is a deliberate save.
 */
export function liveNoteAppender(
  editor: Editor,
  save: (markdown: string) => void,
): LiveNoteAppender {
  return (card) => {
    if (!appendCardToEditor(editor, card)) return false
    save(editor.getMarkdown())
    return true
  }
}
