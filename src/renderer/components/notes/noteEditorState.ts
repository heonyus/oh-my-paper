import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import type { KnowledgeNode } from "../../../shared/knowledgeSchemas"
import { findLinkCompletions, type LinkCompletion } from "../../lib/knowledgeLinks"
import { noteLiveDecorations } from "./noteEditorDecorations"

export type NoteAssetInsertRequest =
  | { readonly kind: "pick" }
  | { readonly kind: "paste" | "drop"; readonly file: File }

export interface NoteAssetInsertResult {
  readonly markdownSource: string
}

export interface CompletionMenu {
  readonly from: number
  readonly to: number
  readonly query: string
  readonly options: readonly LinkCompletion[]
}

export function completionAt(
  view: EditorView,
  nodes: readonly KnowledgeNode[],
): CompletionMenu | null {
  const selection = view.state.selection.main
  if (!selection.empty) return null
  const before = view.state.doc.sliceString(0, selection.head)
  const match = /\[\[([^\]\n|]*)$/u.exec(before)
  if (!match || match.index === undefined) return null
  const query = match[1] ?? ""
  const options = findLinkCompletions(query, nodes)
  return options.length > 0 ? { from: match.index, to: selection.head, query, options } : null
}

export function modeExtension(mode: "live" | "source"): Extension {
  return [
    EditorView.editorAttributes.of({ "data-note-mode": mode }),
    mode === "live" ? noteLiveDecorations : [],
  ]
}

export function imageFile(files: FileList | null): File | null {
  if (!files) return null
  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null
}
