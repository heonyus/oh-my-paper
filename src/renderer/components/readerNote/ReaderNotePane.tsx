import type { Editor } from "@tiptap/react"
import { X } from "lucide-react"
import { type JSX, useCallback, useEffect, useState } from "react"
import type { ReaderNote } from "../../../shared/readerNote"
import type { SourceCitation } from "../../lib/chatCitations"
import { useTranslator } from "../../lib/locale"
import type { ScoredSource } from "../../lib/noteSources"
import type { EarlierNote } from "../../lib/noteTutor"
import { useMeaningSearchReady } from "../../lib/useMeaningSearchReady"
import { type CompanionDensity, useNoteCompanion } from "../../lib/useNoteCompanion"
import type { RegisterLiveNote } from "../../lib/useReaderNote"
import { type NoteMessageKey, noteMessages } from "../../messages/note"
import type { AiRequestRunner, DocumentRecord } from "../../types"
import { evidenceQuote } from "./evidenceNode"
import { liveNoteAppender } from "./liveNoteAppend"
import { MarginColumn } from "./MarginColumn"
import { noteQuoteContent, type PendingNoteQuote } from "./noteQuote"
import { ReaderNoteEditor } from "./ReaderNoteEditor"
import { SourceLinkOverlay } from "./SourceLinkOverlay"

const DENSITY_KEY = "ohmypaper:note-companion"
const densities: readonly { readonly id: CompanionDensity; readonly label: NoteMessageKey }[] = [
  { id: "quiet", label: "density.quiet" },
  { id: "normal", label: "density.normal" },
  { id: "active", label: "density.active" },
]

function storedDensity(): CompanionDensity {
  try {
    const value = window.localStorage.getItem(DENSITY_KEY)
    return value === "quiet" || value === "active" ? value : "normal"
  } catch {
    return "normal"
  }
}

function storeDensity(density: CompanionDensity): void {
  try {
    window.localStorage.setItem(DENSITY_KEY, density)
  } catch {
    // Without storage the choice lasts for this session only.
  }
}

/**
 * The reader's note beside the paper. While the reader writes, the sentence in progress is
 * matched to its source passage on this machine, and the tutor builds on each paragraph with the
 * connected model. `조용히` turns both off; nothing is ever written into the note for the reader.
 */
export function ReaderNotePane({
  document,
  note,
  currentPage,
  earlierNotes,
  onAiRequest,
  onChange,
  onClose,
  onNavigateToSource,
  pendingQuote,
  onPendingQuoteHandled,
  registerLiveNote,
}: {
  readonly document: DocumentRecord
  readonly note: ReaderNote | undefined
  readonly currentPage: number
  readonly earlierNotes: readonly EarlierNote[]
  readonly onAiRequest: AiRequestRunner
  readonly onChange: (markdown: string) => void
  readonly onClose: () => void
  readonly onNavigateToSource: (citation: SourceCitation) => void
  readonly pendingQuote: PendingNoteQuote | null
  readonly onPendingQuoteHandled: () => void
  /** Lets note cards for this paper go through the editor while it is open. */
  readonly registerLiveNote?: RegisterLiveNote | undefined
}): JSX.Element {
  const t = useTranslator(noteMessages)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [density, setDensity] = useState(storedDensity)
  const rank = window.ohmypaper.rankByMeaning
  const searchState = useMeaningSearchReady(density !== "quiet")
  const companion = useNoteCompanion(editor, {
    density: searchState === "unavailable" ? "quiet" : density,
    documentId: document.id,
    pageCount: document.pageCount,
    currentPage,
    earlierNotes,
    rank,
    onAiRequest,
  })

  useEffect(() => {
    if (!editor || !registerLiveNote) return
    return registerLiveNote(document.id, liveNoteAppender(editor, onChange))
  }, [editor, document.id, registerLiveNote, onChange])

  useEffect(() => {
    if (!editor || !pendingQuote) return
    editor
      .chain()
      .insertContentAt(
        editor.state.doc.content.size,
        noteQuoteContent(pendingQuote.page, pendingQuote.quote),
      )
      .focus("end")
      .scrollIntoView()
      .run()
    onPendingQuoteHandled()
  }, [editor, pendingQuote, onPendingQuoteHandled])

  const attach = useCallback(
    (pos: number, source: ScoredSource): void => {
      const node = editor?.state.doc.nodeAt(pos)
      if (!editor || !node) return
      editor
        .chain()
        .focus()
        .insertContentAt(pos + node.nodeSize - 1, [
          ...(/\s$/u.test(node.textContent) ? [] : [{ type: "text", text: " " }]),
          { type: "evidence", attrs: { page: source.page, quote: evidenceQuote(source.text) } },
        ])
        .run()
    },
    [editor],
  )
  const open = useCallback(
    (page: number, text: string): void => onNavigateToSource({ page, quote: text.slice(0, 200) }),
    [onNavigateToSource],
  )
  const status =
    density === "quiet"
      ? null
      : searchState === "loading"
        ? t("pane.preparing")
        : searchState === "failed" || companion.failed
          ? t("pane.error")
          : null

  return (
    <section className="note-pane" aria-label={t("pane.label")}>
      <header className="note-pane-head">
        <h2>{t("pane.label")}</h2>
        <div className="note-pane-actions">
          {status ? (
            <span className="note-pane-status" role="status">
              {status}
            </span>
          ) : null}
          <fieldset className="note-density" aria-label={t("density.label")}>
            {densities.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={density === item.id}
                disabled={!rank && item.id !== "quiet"}
                onClick={() => {
                  storeDensity(item.id)
                  setDensity(item.id)
                }}
              >
                {t(item.label)}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="note-pane-close"
            aria-label={t("pane.close")}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="note-scroll">
        <div className="note-sheet">
          <ReaderNoteEditor
            key={document.id}
            initialMarkdown={note?.markdown ?? ""}
            onMarkdownChange={onChange}
            onEditorChange={setEditor}
            onOpenEvidence={(page, quote) => onNavigateToSource({ page, quote })}
          />
          <MarginColumn
            editor={editor}
            match={companion.match}
            tutors={companion.tutors}
            onAttach={attach}
            onOpen={open}
            onCitation={onNavigateToSource}
          />
        </div>
      </div>
      <SourceLinkOverlay editor={editor} match={companion.match} />
    </section>
  )
}
