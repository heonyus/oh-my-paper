import { type AnyExtension, getSchema } from "@tiptap/core"
import { Markdown, MarkdownManager } from "@tiptap/markdown"
import { DOMSerializer, type Schema } from "@tiptap/pm/model"
import StarterKit from "@tiptap/starter-kit"
import { MathNode, typesetMathElement } from "./readerNote/mathNode"

/** What a memo can hold. The editor and the preview read the same Markdown into the same nodes. */
export function memoContentExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
    Markdown,
    MathNode,
  ]
}

type MemoRenderer = {
  readonly schema: Schema
  readonly markdown: MarkdownManager
  readonly serializer: DOMSerializer
}

let renderer: MemoRenderer | null = null

/** Built once: the schema and Markdown parser an editor would otherwise build for each memo. */
function memoRenderer(): MemoRenderer {
  if (renderer) return renderer
  const extensions = memoContentExtensions()
  const schema = getSchema(extensions)
  renderer = {
    schema,
    markdown: new MarkdownManager({ extensions }),
    serializer: DOMSerializer.fromSchema(schema),
  }
  return renderer
}

/** Chrome and Safari, where ProseMirror puts an empty image after a formula that ends a line. */
const SEPARATES_TRAILING_FORMULA =
  typeof navigator !== "undefined" &&
  (/Chrome\/\d+/u.test(navigator.userAgent) || /Apple Computer/u.test(navigator.vendor))

function separator(): HTMLImageElement {
  return Object.assign(document.createElement("img"), {
    className: "ProseMirror-separator",
    alt: "",
  })
}

/** A formula or a line break: one whole thing the caret cannot go inside. */
function isAtom(node: Node | null): boolean {
  return node instanceof HTMLElement && (node.nodeName === "BR" || node.hasAttribute("data-math"))
}

/** What comes just before `node` in its text block, looking out through bold, links and the like. */
function inlineBefore(node: Node, block: HTMLElement): Node | null {
  let current = node
  while (current !== block && current.previousSibling === null && current.parentNode)
    current = current.parentNode
  return current === block ? null : current.previousSibling
}

/**
 * Gives a text block the invisible nodes ProseMirror gives it in an editor: an empty image
 * before a formula or line break that starts the block or follows another, and at the end, when
 * the block is empty or its last thing is not text, a line break (after another empty image for
 * a formula). They take up room, a line each around a displayed formula, so a preview without
 * them would sit differently from the editor that replaces it.
 */
function addEditorHackNodes(block: HTMLElement): void {
  for (const atom of [...block.querySelectorAll<HTMLElement>("br, span[data-math]")]) {
    const before = inlineBefore(atom, block)
    if (before === null || isAtom(before)) atom.before(separator())
  }
  let parent: Node = block
  let last = block.lastChild
  while (last instanceof HTMLElement && !isAtom(last) && last.nodeName !== "IMG") {
    parent = last
    last = last.lastChild
  }
  if (last instanceof Text && !last.data.endsWith("\n")) return
  if (SEPARATES_TRAILING_FORMULA && last instanceof HTMLElement && last.hasAttribute("data-math"))
    parent.appendChild(separator())
  block.append(
    Object.assign(document.createElement("br"), { className: "ProseMirror-trailingBreak" }),
  )
}

/**
 * A memo's content as the elements its editor would show, made without an editor: with the
 * editor's invisible nodes, the line it keeps to write on at the end, formulas typeset, and the
 * placeholder on an empty memo, so nothing moves when the editor takes its place. Null when the
 * Markdown does not read into a memo, in which case the caller shows the editor, which copes
 * with it.
 */
export function renderMemoPreview(markdown: string, placeholder: string): DocumentFragment | null {
  try {
    const { schema, markdown: manager, serializer } = memoRenderer()
    // An empty memo parses to no blocks at all; filled, it is the one empty line an editor shows.
    const parsed = schema.nodeFromJSON(manager.parse(markdown))
    const filled = schema.topNodeType.createAndFill(null, parsed.content)
    const paragraph = schema.nodes["paragraph"]
    if (!filled || !paragraph) return null
    // The editor keeps an empty line under a memo that ends in a list, a heading or a quote.
    const doc =
      filled.lastChild?.type === paragraph
        ? filled
        : filled.copy(filled.content.addToEnd(paragraph.create()))
    doc.check()
    const content = serializer.serializeFragment(doc.content)
    if (!(content instanceof DocumentFragment)) return null
    for (const block of content.querySelectorAll<HTMLElement>("p, h1, h2, h3"))
      addEditorHackNodes(block)
    for (const formula of content.querySelectorAll<HTMLElement>("span[data-math]"))
      typesetMathElement(formula)
    const only = doc.childCount === 1 ? doc.firstChild : null
    const first = content.firstElementChild
    if (only?.isTextblock && only.content.size === 0 && first) {
      first.classList.add("is-empty", "is-editor-empty")
      first.setAttribute("data-placeholder", placeholder)
    }
    return content
  } catch {
    return null
  }
}
