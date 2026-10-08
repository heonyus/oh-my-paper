import { Extension, getNodeType } from "@tiptap/core"
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const ITEM = "listItem"
const LISTS: readonly string[] = ["bulletList", "orderedList"]

/** The list item around the cursor, with the list it sits in and its place in that list. */
function itemAround($pos: ResolvedPos): {
  readonly depth: number
  readonly node: ProseMirrorNode
  readonly list: ProseMirrorNode
  readonly index: number
} | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.type.name !== ITEM) continue
    const list = $pos.node(depth - 1)
    if (!LISTS.includes(list.type.name)) return null
    return { depth, node, list, index: $pos.index(depth - 1) }
  }
  return null
}

/** A stand-in item: an empty line that only exists so the items under it can be indented. */
function isStub(node: ProseMirrorNode): boolean {
  const first = node.firstChild
  return (
    node.type.name === ITEM &&
    first !== null &&
    first.type.name === "paragraph" &&
    first.content.size === 0 &&
    (node.childCount === 1 || (node.childCount === 2 && LISTS.includes(node.child(1).type.name)))
  )
}

/**
 * Indents the first item of a list, which has no item above it to tuck under: a hidden
 * stand-in item is made above it so the list can nest, as a plain text note would indent.
 */
function indentFirstItem(state: EditorState): { readonly tr: EditorState["tr"] } | null {
  const { selection } = state
  if (!selection.empty) return null
  const item = itemAround(selection.$from)
  if (item?.index !== 0) return null
  const paragraph = getNodeType("paragraph", state.schema)
  const stub = item.node.type.create(null, [
    paragraph.create(),
    item.list.type.create(item.list.attrs, [item.node]),
  ])
  const from = selection.$from.before(item.depth)
  const tr = state.tr.replaceWith(from, from + item.node.nodeSize, stub)
  // The cursor keeps its place inside the item, which now sits after the stub's empty line.
  tr.setSelection(TextSelection.create(tr.doc, selection.from + 4))
  return { tr }
}

/** The stand-in item directly around the cursor's item, when that item is its only child. */
function stubParent(state: EditorState): { readonly from: number; readonly to: number } | null {
  const item = itemAround(state.selection.$from)
  if (!item || item.depth < 3) return null
  const $from = state.selection.$from
  const parent = $from.node(item.depth - 2)
  if (!isStub(parent) || item.list.childCount !== 1) return null
  const from = $from.before(item.depth - 2)
  return { from, to: from + parent.nodeSize }
}

/**
 * A note file keeps a stand-in as `-` with nothing after it, which reads back as an item with
 * no line of its own. The editor needs that line, so one is put back before anything else runs.
 */
function restoreStubLines(tr: Transaction): boolean {
  const paragraph = getNodeType("paragraph", tr.doc.type.schema)
  const starts: number[] = []
  tr.doc.descendants((node, pos) => {
    if (node.type.name === ITEM && node.firstChild && !node.firstChild.isTextblock) {
      starts.push(pos + 1)
    }
    return true
  })
  for (const start of starts.reverse()) tr.insert(start, paragraph.create())
  return starts.length > 0
}

const stubDecorations = new PluginKey("noteListStubs")

/**
 * Tab and ⇧Tab belong to the note. A list item moves in under the item above it; the first
 * item, having none, moves in under a hidden stand-in line, and moving back out removes it.
 */
export const NoteTabKeys = Extension.create({
  name: "noteTabKeys",
  addKeyboardShortcuts() {
    const outdent = (): boolean => {
      const stub = stubParent(this.editor.state)
      if (!this.editor.commands.liftListItem(ITEM)) return false
      if (!stub) return true
      const leftover = this.editor.state.doc.nodeAt(stub.from)
      if (leftover && isStub(leftover) && leftover.childCount === 1) {
        this.editor.commands.deleteRange({ from: stub.from, to: stub.from + leftover.nodeSize })
      }
      return true
    }
    return {
      Tab: () => {
        if (this.editor.commands.sinkListItem(ITEM)) return true
        const indented = indentFirstItem(this.editor.state)
        if (indented) this.editor.view.dispatch(indented.tr.scrollIntoView())
        // Where nothing can move, the key still does nothing rather than leave the editor.
        return true
      },
      "Shift-Tab": () => {
        outdent()
        return true
      },
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty || $from.parentOffset !== 0 || !stubParent(this.editor.state)) return false
        return outdent()
      },
    }
  },
  onCreate() {
    const tr = this.editor.state.tr
    if (restoreStubLines(tr)) this.editor.view.dispatch(tr)
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: stubDecorations,
        appendTransaction: (transactions, _previous, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          const tr = state.tr
          return restoreStubLines(tr) ? tr : null
        },
        props: {
          decorations: (state) => {
            const marks: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (isStub(node) && node.childCount === 2) {
                marks.push(Decoration.node(pos, pos + node.nodeSize, { class: "note-list-stub" }))
              }
              return true
            })
            return DecorationSet.create(state.doc, marks)
          },
        },
      }),
    ]
  },
})
