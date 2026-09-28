import type { Editor } from "@tiptap/react"
import { X } from "lucide-react"
import { type JSX, useCallback, useEffect, useState } from "react"
import type { ReaderNote } from "../../../shared/readerNote"
import type { SourceCitation } from "../../lib/chatCitations"
import type { MarginSuggestion } from "../../lib/marginSuggestions"
import { useMarginSuggestions } from "../../lib/useMarginSuggestions"
import type { DocumentRecord } from "../../types"
import { evidenceQuote } from "./evidenceNode"
import { MarginColumn } from "./MarginColumn"
import { noteQuoteContent, type PendingNoteQuote } from "./noteQuote"
import { ReaderNoteEditor } from "./ReaderNoteEditor"

const MARGIN_SETTING_KEY = "ohmypaper:margin-ai"

type MarginState = "on" | "off" | "unavailable" | "error"
const marginLabels: Readonly<Record<MarginState, string>> = {
  on: "켜짐",
  off: "꺼짐",
  unavailable: "키 없음",
  error: "오류",
}

function storedMarginSetting(): boolean {
  try {
    return window.localStorage.getItem(MARGIN_SETTING_KEY) === "on"
  } catch {
    return false
  }
}

function storeMarginSetting(on: boolean): void {
  try {
    window.localStorage.setItem(MARGIN_SETTING_KEY, on ? "on" : "off")
  } catch {
    // Without storage the choice lasts for this session only.
  }
}

/**
 * The reader's note beside the paper, with a margin where Jev points at the source paragraphs
 * each sentence rests on. The margin sends text out only while the reader has switched it on;
 * without an OpenRouter key it stays off and says so on its switch.
 */
export function ReaderNotePane({
  document,
  note,
  currentPage,
  onChange,
  onClose,
  onNavigateToSource,
  pendingQuote,
  onPendingQuoteHandled,
}: {
  readonly document: DocumentRecord
  readonly note: ReaderNote | undefined
  readonly currentPage: number
  readonly onChange: (markdown: string) => void
  readonly onClose: () => void
  readonly onNavigateToSource: (citation: SourceCitation) => void
  readonly pendingQuote: PendingNoteQuote | null
  readonly onPendingQuoteHandled: () => void
}): JSX.Element {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [marginOn, setMarginOn] = useState(storedMarginSetting)
  const decide = window.ohmypaper.decideAi
  const margin = useMarginSuggestions(editor, {
    enabled: marginOn,
    documentId: document.id,
    pageCount: document.pageCount,
    currentPage,
    decide,
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

  const marginState: MarginState =
    !decide || margin.failure === "unavailable"
      ? "unavailable"
      : !marginOn
        ? "off"
        : margin.failure === "error"
          ? "error"
          : "on"

  const attach = useCallback(
    (pos: number, suggestion: MarginSuggestion): void => {
      const node = editor?.state.doc.nodeAt(pos)
      if (!editor || !node) return
      const end = pos + node.nodeSize - 1
      editor
        .chain()
        .focus()
        .insertContentAt(end, [
          ...(/\s$/u.test(node.textContent) ? [] : [{ type: "text", text: " " }]),
          {
            type: "evidence",
            attrs: { page: suggestion.page, quote: evidenceQuote(suggestion.text) },
          },
        ])
        .run()
    },
    [editor],
  )
  const open = useCallback(
    (page: number, text: string): void => onNavigateToSource({ page, quote: text.slice(0, 200) }),
    [onNavigateToSource],
  )

  return (
    <section className="note-pane" aria-label="내 노트">
      <header className="note-pane-head">
        <h2>내 노트</h2>
        <div className="note-pane-actions">
          <button
            type="button"
            className="note-margin-toggle"
            aria-pressed={marginOn && Boolean(decide)}
            data-state={marginState}
            disabled={!decide}
            onClick={() => {
              storeMarginSetting(!marginOn)
              setMarginOn(!marginOn)
            }}
          >
            여백 AI {marginLabels[marginState]}
          </button>
          <button type="button" aria-label="노트 닫기" onClick={onClose}>
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
            editor={marginOn ? editor : null}
            entries={margin.entries}
            onAttach={attach}
            onOpen={open}
          />
        </div>
      </div>
    </section>
  )
}
