import type { Editor } from "@tiptap/react"
import { X } from "lucide-react"
import { type JSX, useCallback, useEffect, useState } from "react"
import type { ReaderNote } from "../../../shared/readerNote"
import type { SourceCitation } from "../../lib/chatCitations"
import type { ScoredSource } from "../../lib/noteSources"
import type { EarlierNote } from "../../lib/noteTutor"
import { useMeaningSearchReady } from "../../lib/useMeaningSearchReady"
import { type CompanionDensity, useNoteCompanion } from "../../lib/useNoteCompanion"
import type { AiRequestRunner, DocumentRecord } from "../../types"
import { evidenceQuote } from "./evidenceNode"
import { MarginColumn } from "./MarginColumn"
import { noteQuoteContent, type PendingNoteQuote } from "./noteQuote"
import { ReaderNoteEditor } from "./ReaderNoteEditor"
import { SourceLinkOverlay } from "./SourceLinkOverlay"

const DENSITY_KEY = "ohmypaper:note-companion"
const densities: readonly { readonly id: CompanionDensity; readonly label: string }[] = [
  { id: "quiet", label: "조용히" },
  { id: "normal", label: "보통" },
  { id: "active", label: "적극적" },
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
}): JSX.Element {
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
        ? "준비 중"
        : searchState === "failed" || companion.failed
          ? "오류"
          : null

  return (
    <section className="note-pane" aria-label="내 노트">
      <header className="note-pane-head">
        <h2>내 노트</h2>
        <div className="note-pane-actions">
          {status ? (
            <span className="note-pane-status" role="status">
              {status}
            </span>
          ) : null}
          <fieldset className="note-density" aria-label="여백 반응">
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
                {item.label}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="note-pane-close"
            aria-label="노트 닫기"
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
