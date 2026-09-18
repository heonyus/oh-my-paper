import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { Compartment, EditorState, Transaction } from "@codemirror/state"
import { Decoration, EditorView, keymap } from "@codemirror/view"
import { type JSX, useLayoutEffect, useRef, useState } from "react"
import type { KnowledgeNode } from "../../../shared/knowledgeSchemas"
import type { LocalInferenceApi } from "../../../shared/localInference"
import {
  chooseNoteCompletion,
  insertNoteAsset,
  LocalSuggestionWidget,
  NoteEditorControls,
  useNoteEditorLocalSuggestion,
} from "./NoteEditorControls"
import {
  editTableAtSelection,
  insertMarkdownLink,
  insertTableAtSelection,
  wrapSelection,
} from "./noteEditorActions"
import {
  type CompletionMenu,
  completionAt,
  imageFile,
  modeExtension,
  type NoteAssetInsertRequest,
  type NoteAssetInsertResult,
} from "./noteEditorState"
import { findTableAt } from "./noteRichContent"
import "./noteEditor.css"

export type { NoteAssetInsertRequest, NoteAssetInsertResult } from "./noteEditorState"

export interface NoteEditorProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly nodes: readonly KnowledgeNode[]
  readonly id?: string | undefined
  readonly noteTitle?: string | undefined
  readonly documentFirst?: boolean | undefined
  readonly localInferenceApi?: LocalInferenceApi | null | undefined
  readonly ariaLabel?: string | undefined
  readonly onSaveShortcut?: (() => void) | undefined
  readonly onSelectionChange?:
    | ((selection: { readonly from: number; readonly to: number }) => void)
    | undefined
  readonly onAssetInsert?:
    | ((request: NoteAssetInsertRequest) => Promise<NoteAssetInsertResult | null>)
    | undefined
}

export function NoteEditor({
  value,
  onChange,
  nodes,
  id = "note-editor-input",
  noteTitle = "이 노트",
  documentFirst = false,
  localInferenceApi = null,
  ariaLabel = "마크다운 본문 편집",
  onSaveShortcut,
  onSelectionChange,
  onAssetInsert,
}: NoteEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const initialValueRef = useRef(value)
  const viewRef = useRef<EditorView | null>(null)
  const modeCompartment = useRef(new Compartment())
  const ghostCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  const nodesRef = useRef(nodes)
  const assetInsertRef = useRef(onAssetInsert)
  const onSaveShortcutRef = useRef(onSaveShortcut)
  const selectionChangeRef = useRef(onSelectionChange)
  const insertAssetEventRef = useRef<(request: NoteAssetInsertRequest) => void>(() => {})
  const syncingRef = useRef(false)
  const composingRef = useRef(false)
  const tableAvailableRef = useRef(false)
  const compositionStartRef = useRef("")
  const pendingExternalRef = useRef<string | null>(null)
  const [mode, setMode] = useState<"live" | "source">("live")
  const [completion, setCompletion] = useState<CompletionMenu | null>(null)
  const [tableAvailable, setTableAvailable] = useState(false)
  const [cursorAtEnd, setCursorAtEnd] = useState(true)
  const [composing, setComposing] = useState(false)
  const [assetError, setAssetError] = useState<string | null>(null)
  onChangeRef.current = onChange
  nodesRef.current = nodes
  assetInsertRef.current = onAssetInsert
  onSaveShortcutRef.current = onSaveShortcut
  selectionChangeRef.current = onSelectionChange
  insertAssetEventRef.current = (request) =>
    void insertNoteAsset({
      viewRef,
      insert: assetInsertRef.current,
      request,
      onError: setAssetError,
    })
  tableAvailableRef.current = tableAvailable
  const localSuggestionEditor = useNoteEditorLocalSuggestion({
    api: localInferenceApi,
    nodeTitle: noteTitle,
    draft: value,
    composing,
    cursorAtEnd: cursorAtEnd && !tableAvailable && completion === null,
    viewRef,
    composingRef,
    tableAvailableRef,
    completionActive: completion !== null,
  })
  const { acceptRef, dismissRef } = localSuggestionEditor

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        history(),
        markdown({ base: markdownLanguage, completeHTMLTags: false }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          { key: "Tab", run: () => acceptRef.current() },
          { key: "Escape", run: () => dismissRef.current() },
          {
            key: "Mod-s",
            run: () => {
              onSaveShortcutRef.current?.()
              return true
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ id, "aria-label": ariaLabel }),
        modeCompartment.current.of(modeExtension("live")),
        ghostCompartment.current.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingRef.current) {
            onChangeRef.current(update.state.doc.toString())
          }
          if (update.docChanged || update.selectionSet) {
            const selection = update.state.selection.main
            selectionChangeRef.current?.({ from: selection.from, to: selection.to })
            setCursorAtEnd(selection.empty && selection.head === update.state.doc.length)
          }
          if (update.docChanged || update.selectionSet || update.focusChanged) {
            setCompletion(update.view.hasFocus ? completionAt(update.view, nodesRef.current) : null)
            const head = update.state.selection.main.head
            setTableAvailable(findTableAt(update.state.doc.toString(), head) !== null)
          }
        }),
      ],
    })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    setTableAvailable(
      findTableAt(view.state.doc.toString(), view.state.selection.main.head) !== null,
    )
    setCursorAtEnd(
      view.state.selection.main.empty && view.state.selection.main.head === view.state.doc.length,
    )
    const compositionStart = (): void => {
      composingRef.current = true
      setComposing(true)
      compositionStartRef.current = view.state.doc.toString()
    }
    const compositionEnd = (): void => {
      composingRef.current = false
      setComposing(false)
      const pending = pendingExternalRef.current
      pendingExternalRef.current = null
      if (pending !== null && view.state.doc.toString() === compositionStartRef.current) {
        syncingRef.current = true
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: pending },
          annotations: Transaction.addToHistory.of(false),
        })
        syncingRef.current = false
      }
    }
    const paste = (event: ClipboardEvent): void => {
      const file = imageFile(event.clipboardData?.files ?? null)
      if (!file || !assetInsertRef.current) return
      event.preventDefault()
      insertAssetEventRef.current({ kind: "paste", file })
    }
    const drop = (event: DragEvent): void => {
      const file = imageFile(event.dataTransfer?.files ?? null)
      if (!file || !assetInsertRef.current) return
      event.preventDefault()
      insertAssetEventRef.current({ kind: "drop", file })
    }
    const dragOver = (event: DragEvent): void => {
      if (imageFile(event.dataTransfer?.files ?? null) && assetInsertRef.current) {
        event.preventDefault()
      }
    }
    view.contentDOM.addEventListener("compositionstart", compositionStart)
    view.contentDOM.addEventListener("compositionend", compositionEnd)
    view.contentDOM.addEventListener("paste", paste)
    view.contentDOM.addEventListener("drop", drop)
    view.contentDOM.addEventListener("dragover", dragOver)
    return () => {
      view.contentDOM.removeEventListener("compositionstart", compositionStart)
      view.contentDOM.removeEventListener("compositionend", compositionEnd)
      view.contentDOM.removeEventListener("paste", paste)
      view.contentDOM.removeEventListener("drop", drop)
      view.contentDOM.removeEventListener("dragover", dragOver)
      view.destroy()
      if (viewRef.current === view) viewRef.current = null
    }
  }, [acceptRef, ariaLabel, dismissRef, id])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    if (composingRef.current) {
      pendingExternalRef.current = value
      return
    }
    syncingRef.current = true
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: Transaction.addToHistory.of(false),
    })
    syncingRef.current = false
  }, [value])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: modeCompartment.current.reconfigure(modeExtension(mode)) })
  }, [mode])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    const decorations =
      localSuggestionEditor.ghostSuggestion === null
        ? Decoration.none
        : Decoration.set([
            Decoration.widget({
              widget: new LocalSuggestionWidget(localSuggestionEditor.ghostSuggestion),
              side: 1,
            }).range(view.state.doc.length),
          ])
    view.dispatch({
      effects: ghostCompartment.current.reconfigure(EditorView.decorations.of(decorations)),
    })
  }, [localSuggestionEditor.ghostSuggestion])

  return (
    <div className={documentFirst ? "note-editor note-editor-document" : "note-editor"}>
      <NoteEditorControls
        mode={mode}
        tableAvailable={tableAvailable}
        completions={completion?.options ?? []}
        assetEnabled={Boolean(onAssetInsert)}
        assetError={assetError}
        onModeChange={setMode}
        onInsertTable={() => {
          const view = viewRef.current
          if (view) insertTableAtSelection(view)
        }}
        onToggleStrong={() => {
          const view = viewRef.current
          if (view) wrapSelection(view, "**")
        }}
        onToggleEmphasis={() => {
          const view = viewRef.current
          if (view) wrapSelection(view, "*")
        }}
        onInsertLink={() => {
          const view = viewRef.current
          if (view) insertMarkdownLink(view)
        }}
        onInsertMath={() => {
          const view = viewRef.current
          if (view) wrapSelection(view, "$")
        }}
        onEditTable={(kind) => {
          const view = viewRef.current
          if (view) editTableAtSelection(view, kind)
        }}
        onChooseCompletion={(option) =>
          chooseNoteCompletion({
            viewRef,
            completion,
            nodes: nodesRef.current,
            option,
            onDone: () => setCompletion(null),
          })
        }
        onInsertAsset={() =>
          void insertNoteAsset({
            viewRef,
            insert: assetInsertRef.current,
            request: { kind: "pick" },
            onError: setAssetError,
          })
        }
      />
      <div ref={hostRef} className="note-editor-host" />
    </div>
  )
}
