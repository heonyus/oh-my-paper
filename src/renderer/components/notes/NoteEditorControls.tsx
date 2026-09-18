import { isolateHistory } from "@codemirror/commands"
import { type EditorView, WidgetType, type WidgetType as WidgetTypeValue } from "@codemirror/view"
import { type JSX, useRef, useState } from "react"
import type { KnowledgeNode } from "../../../shared/knowledgeSchemas"
import type { LocalInferenceApi } from "../../../shared/localInference"
import type { LinkCompletion } from "../../lib/knowledgeLinks"
import { useLocalSuggestions } from "../../lib/useLocalSuggestions"
import {
  type CompletionMenu,
  completionAt,
  type NoteAssetInsertRequest,
  type NoteAssetInsertResult,
} from "./noteEditorState"

export class LocalSuggestionWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }

  eq(other: WidgetTypeValue): boolean {
    return other instanceof LocalSuggestionWidget && other.text === this.text
  }

  toDOM(): HTMLElement {
    const ghost = document.createElement("span")
    ghost.className = "note-editor-ghost"
    ghost.textContent = this.text
    ghost.setAttribute("aria-hidden", "true")
    ghost.contentEditable = "false"
    ghost.style.color = "var(--ink-muted)"
    ghost.style.fontStyle = "italic"
    ghost.style.opacity = "0.72"
    ghost.style.pointerEvents = "none"
    return ghost
  }

  ignoreEvent(): boolean {
    return true
  }
}

type EditorViewRef = { readonly current: EditorView | null }

export function useNoteEditorLocalSuggestion(options: {
  readonly api: LocalInferenceApi | null
  readonly nodeTitle: string
  readonly draft: string
  readonly composing: boolean
  readonly cursorAtEnd: boolean
  readonly viewRef: EditorViewRef
  readonly composingRef: { readonly current: boolean }
  readonly tableAvailableRef: { readonly current: boolean }
  readonly completionActive: boolean
}): {
  readonly ghostSuggestion: string | null
  readonly deterministicSuggestions: readonly string[]
  readonly acceptRef: { readonly current: () => boolean }
  readonly dismissRef: { readonly current: () => boolean }
} {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const suggestions = useLocalSuggestions({
    api: options.api,
    nodeTitle: options.nodeTitle,
    draft: options.draft,
    enabled: options.api !== null,
    imeComposing: options.composing,
    cursorAtEnd: options.cursorAtEnd,
  })
  const suggestion = suggestions.localSuggestions[0] ?? null
  const suggestionKey = suggestion === null ? null : `${suggestions.revision}:${suggestion}`
  const acceptRef = useRef<() => boolean>(() => false)
  const dismissRef = useRef<() => boolean>(() => false)
  acceptRef.current = () => {
    const view = options.viewRef.current
    if (
      !view ||
      suggestion === null ||
      options.composingRef.current ||
      options.tableAvailableRef.current ||
      options.completionActive
    )
      return false
    const selection = view.state.selection.main
    if (!selection.empty || selection.head !== view.state.doc.length) return false
    const prefix =
      view.state.doc.length > 0 && !view.state.doc.toString().endsWith("\n") ? "\n" : ""
    const insert = `${prefix}${suggestion}`
    view.dispatch({
      changes: { from: selection.head, insert },
      selection: { anchor: selection.head + insert.length },
    })
    setDismissedKey(suggestionKey)
    view.focus()
    return true
  }
  dismissRef.current = () => {
    if (suggestion === null) return false
    setDismissedKey(suggestionKey)
    return true
  }
  return {
    ghostSuggestion: suggestionKey === dismissedKey ? null : suggestion,
    deterministicSuggestions: suggestions.deterministicSuggestions,
    acceptRef,
    dismissRef,
  }
}

export function chooseNoteCompletion(options: {
  readonly viewRef: EditorViewRef
  readonly completion: CompletionMenu | null
  readonly nodes: readonly KnowledgeNode[]
  readonly option: LinkCompletion
  readonly onDone: () => void
}): void {
  const view = options.viewRef.current
  if (!view || !options.completion) return
  const current = completionAt(view, options.nodes)
  if (
    !current ||
    current.from !== options.completion.from ||
    current.to !== options.completion.to ||
    current.query !== options.completion.query
  )
    return
  const label = current.query.trim() || options.option.node.title
  const insert = `[[${options.option.node.id}|${label}]]`
  view.dispatch({
    changes: { from: current.from, to: current.to, insert },
    selection: { anchor: current.from + insert.length },
    annotations: isolateHistory.of("before"),
  })
  options.onDone()
  view.focus()
}

export async function insertNoteAsset(options: {
  readonly viewRef: EditorViewRef
  readonly insert:
    | ((request: NoteAssetInsertRequest) => Promise<NoteAssetInsertResult | null>)
    | null
    | undefined
  readonly request: NoteAssetInsertRequest
  readonly onError: (message: string | null) => void
}): Promise<void> {
  const view = options.viewRef.current
  if (!view || !options.insert) return
  const source = view.state.doc.toString()
  const selection = view.state.selection.main
  options.onError(null)
  try {
    const result = await options.insert(options.request)
    if (!result || options.viewRef.current !== view) return
    if (view.state.doc.toString() !== source) {
      options.onError("이미지를 준비하는 동안 본문이 변경되어 삽입하지 않았습니다.")
      return
    }
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: result.markdownSource },
      selection: { anchor: selection.from + result.markdownSource.length },
    })
    view.focus()
  } catch (error) {
    if (error instanceof Error) options.onError(error.message)
    else throw error
  }
}

export function insertNoteWritingSuggestion(
  viewRef: EditorViewRef,
  tableAvailableRef: { readonly current: boolean },
  suggestion: string,
): void {
  const view = viewRef.current
  if (!view || tableAvailableRef.current) return
  const selection = view.state.selection.main
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: suggestion },
    selection: { anchor: selection.from + suggestion.length },
  })
  view.focus()
}

interface NoteEditorControlsProps {
  readonly mode: "live" | "source"
  readonly tableAvailable: boolean
  readonly completions: readonly LinkCompletion[]
  readonly assetEnabled: boolean
  readonly assetError: string | null
  readonly onModeChange: (mode: "live" | "source") => void
  readonly onInsertTable: () => void
  readonly onEditTable: (kind: "row" | "column") => void
  readonly onChooseCompletion: (completion: LinkCompletion) => void
  readonly onInsertAsset: () => void
  readonly onToggleStrong: () => void
  readonly onToggleEmphasis: () => void
  readonly onInsertLink: () => void
  readonly onInsertMath: () => void
}

export function NoteEditorControls({
  mode,
  tableAvailable,
  completions,
  assetEnabled,
  assetError,
  onModeChange,
  onInsertTable,
  onEditTable,
  onChooseCompletion,
  onInsertAsset,
  onToggleStrong,
  onToggleEmphasis,
  onInsertLink,
  onInsertMath,
}: NoteEditorControlsProps): JSX.Element {
  return (
    <>
      <div
        className="note-editor-toolbar note-editor-format-toolbar"
        role="toolbar"
        aria-label="서식 도구"
      >
        <span className="note-editor-format-label">본문</span>
        <button type="button" onClick={onToggleStrong} aria-label="굵게">
          <strong>B</strong>
        </button>
        <button type="button" onClick={onToggleEmphasis} aria-label="기울임">
          <em>I</em>
        </button>
        <button type="button" onClick={onInsertLink} aria-label="링크 삽입">
          ↗
        </button>
        <button type="button" onClick={onInsertTable} aria-label="표 삽입">
          ▦
        </button>
        <button type="button" onClick={onInsertMath} aria-label="수식 삽입">
          ∑
        </button>
      </div>
      <div className="note-editor-mode-row" role="toolbar" aria-label="편집 보기">
        <fieldset className="note-editor-mode">
          <legend>편집 보기</legend>
          <button type="button" aria-pressed={mode === "live"} onClick={() => onModeChange("live")}>
            라이브
          </button>
          <button
            type="button"
            aria-pressed={mode === "source"}
            onClick={() => onModeChange("source")}
          >
            소스 보기
          </button>
        </fieldset>
      </div>
      <details className="note-editor-insert">
        <summary>삽입 도구</summary>
        <div className="note-editor-toolbar" role="toolbar" aria-label="마크다운 편집 도구">
          <button type="button" onClick={onInsertTable}>
            표 만들기
          </button>
          {tableAvailable ? (
            <>
              <button type="button" onClick={() => onEditTable("row")}>
                행 추가
              </button>
              <button type="button" onClick={() => onEditTable("column")}>
                열 추가
              </button>
            </>
          ) : null}
          {assetEnabled ? (
            <button type="button" onClick={onInsertAsset}>
              이미지
            </button>
          ) : null}
        </div>
      </details>
      {completions.length > 0 ? (
        <div className="note-editor-completions" role="listbox" aria-label="지식 링크 제안">
          {completions.map((option) => (
            <button
              key={option.node.id}
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChooseCompletion(option)}
            >
              {option.title}
              <span> · {option.node.kind}</span>
            </button>
          ))}
        </div>
      ) : null}
      {assetError ? (
        <p className="note-editor-error" role="alert">
          {assetError}
        </p>
      ) : null}
    </>
  )
}
