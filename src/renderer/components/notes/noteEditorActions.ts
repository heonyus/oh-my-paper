import { isolateHistory } from "@codemirror/commands"
import type { EditorView } from "@codemirror/view"
import {
  addColumnToTable,
  addRowToTable,
  findTableAt,
  type NoteSourceEdit,
} from "./noteRichContent"

function applySourceEdit(view: EditorView, edit: NoteSourceEdit): void {
  if (edit.source === view.state.doc.toString()) return
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: edit.source },
    selection: { anchor: edit.cursor },
    scrollIntoView: true,
    annotations: isolateHistory.of("full"),
  })
  view.focus()
}

export function wrapSelection(view: EditorView, marker: string): void {
  const selection = view.state.selection.main
  const selected = view.state.sliceDoc(selection.from, selection.to)
  const insert = selected ? `${marker}${selected}${marker}` : `${marker}${marker}`
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: {
      anchor: selection.from + marker.length,
      head: selection.from + marker.length + selected.length,
    },
    annotations: isolateHistory.of("full"),
  })
  view.focus()
}

export function insertMarkdownLink(view: EditorView): void {
  const selection = view.state.selection.main
  const selected = view.state.sliceDoc(selection.from, selection.to) || "링크 텍스트"
  const insert = `[${selected}](url)`
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: {
      anchor: selection.from + selected.length + 3,
      head: selection.from + selected.length + 6,
    },
    annotations: isolateHistory.of("full"),
  })
  view.focus()
}

export function insertTableAtSelection(view: EditorView): void {
  const head = view.state.selection.main.head
  const source = view.state.doc.toString()
  const before = head > 0 && source[head - 1] !== "\n" ? "\n\n" : ""
  const after = head < source.length && source[head] !== "\n" ? "\n\n" : ""
  const table = "| 열 1 | 열 2 |\n| --- | --- |\n|  |  |"
  view.dispatch({
    changes: { from: head, insert: `${before}${table}${after}` },
    selection: { anchor: head + before.length + 2, head: head + before.length + 5 },
    scrollIntoView: true,
    annotations: isolateHistory.of("full"),
  })
  view.focus()
}

export function editTableAtSelection(view: EditorView, kind: "row" | "column"): void {
  const source = view.state.doc.toString()
  const table = findTableAt(source, view.state.selection.main.head)
  applySourceEdit(
    view,
    kind === "row" ? addRowToTable(source, table) : addColumnToTable(source, table),
  )
}
