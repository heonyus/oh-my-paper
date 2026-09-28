import type { Editor } from "@tiptap/react"
import { X } from "lucide-react"
import { type JSX, useCallback, useState } from "react"
import type { ReaderNote } from "../../../shared/readerNote"
import type { SourceCitation } from "../../lib/chatCitations"
import type { MarginSuggestion } from "../../lib/marginSuggestions"
import { useMarginSuggestions } from "../../lib/useMarginSuggestions"
import type { DocumentRecord } from "../../types"
import { evidenceQuote } from "./evidenceNode"
import { MarginColumn } from "./MarginColumn"
import { ReaderNoteEditor } from "./ReaderNoteEditor"

const MARGIN_SETTING_KEY = "ohmypaper:margin-ai"

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
 * each sentence rests on. The margin sends text out only while the reader has switched it on.
 */
export function ReaderNotePane({
  document,
  note,
  currentPage,
  onChange,
  onClose,
  onNavigateToSource,
}: {
  readonly document: DocumentRecord
  readonly note: ReaderNote | undefined
  readonly currentPage: number
  readonly onChange: (markdown: string) => void
  readonly onClose: () => void
  readonly onNavigateToSource: (citation: SourceCitation) => void
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
        <div>
          <h2>내 노트</h2>
          <p>AI는 여기에 쓰지 않아요</p>
        </div>
        <div className="note-pane-actions">
          <button
            type="button"
            className="note-margin-toggle"
            aria-pressed={marginOn}
            disabled={!decide}
            onClick={() => {
              storeMarginSetting(!marginOn)
              setMarginOn(!marginOn)
            }}
          >
            여백 AI {marginOn && decide ? "켜짐" : "꺼짐"}
          </button>
          <button type="button" aria-label="노트 닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>
      {!decide ? (
        <p className="note-pane-notice">여백 AI를 쓰려면 OpenRouter 키가 필요합니다.</p>
      ) : !marginOn ? (
        <p className="note-pane-notice">
          켜면 쓰는 문장과 지금 페이지 근처 문단이 OpenRouter(Jev)로 전송돼 근거를 찾습니다.
        </p>
      ) : margin.failed ? (
        <p className="note-pane-notice" role="status">
          여백 AI 응답을 받지 못했습니다. 계속 쓰면 다시 시도합니다.
        </p>
      ) : null}
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
