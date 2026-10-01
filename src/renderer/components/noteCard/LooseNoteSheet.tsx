import type { Editor } from "@tiptap/react"
import { X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import { LOOSE_NOTE_ID, type ReaderNote } from "../../../shared/readerNote"
import { useTranslator } from "../../lib/locale"
import type { RegisterLiveNote } from "../../lib/useReaderNote"
import { noteMessages } from "../../messages/note"
import { liveNoteAppender } from "../readerNote/liveNoteAppend"
import { ReaderNoteEditor } from "../readerNote/ReaderNoteEditor"

/**
 * The loose note, where note cards written away from any paper gather, opened beside the
 * library. It is the same editor as a paper's note, without a paper to match sentences against.
 */
export function LooseNoteSheet({
  note,
  onChange,
  onClose,
  registerLiveNote,
}: {
  readonly note: ReaderNote | undefined
  readonly onChange: (markdown: string) => void
  readonly onClose: () => void
  readonly registerLiveNote: RegisterLiveNote
}): JSX.Element {
  const t = useTranslator(noteMessages)
  const [editor, setEditor] = useState<Editor | null>(null)
  const save = useRef(onChange)
  save.current = onChange

  useEffect(() => {
    if (!editor) return
    return registerLiveNote(
      LOOSE_NOTE_ID,
      liveNoteAppender(editor, (markdown) => save.current(markdown)),
    )
  }, [editor, registerLiveNote])

  return (
    <section className="loose-note-sheet note-pane" aria-label={t("loose.title")}>
      <header className="note-pane-head">
        <h2>{t("loose.title")}</h2>
        <button
          type="button"
          className="note-pane-close"
          aria-label={t("loose.close")}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className="note-scroll">
        <div className="note-sheet">
          <ReaderNoteEditor
            initialMarkdown={note?.markdown ?? ""}
            onMarkdownChange={onChange}
            onEditorChange={setEditor}
            onOpenEvidence={() => undefined}
          />
        </div>
      </div>
    </section>
  )
}
