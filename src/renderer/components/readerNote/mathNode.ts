import { InputRule, mergeAttributes, Node } from "@tiptap/core"
import katex from "katex"

/** `$$…$$` first, so an inline `$…$` never swallows one `$` of a display formula. */
const DISPLAY_MARKDOWN = /^\$\$([^$]+?)\$\$/u
/** `$…$` with no space just inside either `$`, and no digit after, so `$5 and $10` stays text. */
const INLINE_MARKDOWN = /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/u

export type MathAttributes = { readonly latex: string; readonly display: boolean }

function latexOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function mathSource(latex: string, display: boolean): string {
  return display ? `$$${latex}$$` : `$${latex}$`
}

function renderInto(element: HTMLElement, latex: string, display: boolean): void {
  katex.render(latex, element, { throwOnError: false, displayMode: display })
}

/**
 * A formula written as `$…$` or `$$…$$`, shown typeset. Typing the closing `$` turns the text
 * into one; a double click turns it back into text to edit. Saved as the same `$…$`.
 */
export const MathNode = Node.create({
  name: "math",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) => latexOf(element.getAttribute("data-latex")),
      },
      display: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-display") === "true",
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-math]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const latex = latexOf(Reflect.get(node.attrs, "latex"))
    const display = Reflect.get(node.attrs, "display") === true
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-math": "",
        "data-latex": latex,
        "data-display": display ? "true" : "false",
        class: "note-math",
      }),
      mathSource(latex, display),
    ]
  },
  renderText({ node }) {
    return mathSource(
      latexOf(Reflect.get(node.attrs, "latex")),
      Reflect.get(node.attrs, "display") === true,
    )
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span")
      dom.className = "note-math"
      dom.setAttribute("data-math", "")
      const apply = (current: typeof node): void => {
        const latex = latexOf(Reflect.get(current.attrs, "latex"))
        const display = Reflect.get(current.attrs, "display") === true
        dom.setAttribute("data-latex", latex)
        dom.setAttribute("data-display", display ? "true" : "false")
        dom.title = mathSource(latex, display)
        renderInto(dom, latex, display)
      }
      apply(node)
      dom.addEventListener("dblclick", (event) => {
        event.preventDefault()
        const from = getPos()
        if (from === undefined) return
        const latex = dom.getAttribute("data-latex") ?? ""
        const display = dom.getAttribute("data-display") === "true"
        editor
          .chain()
          .focus()
          .insertContentAt({ from, to: from + 1 }, mathSource(latex, display))
          .run()
      })
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== "math") return false
          apply(updated)
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },
  addInputRules() {
    const rule = (find: RegExp, display: boolean): InputRule =>
      new InputRule({
        find,
        handler: ({ state, range, match }) => {
          const latex = latexOf(match[1])
          if (!latex) return null
          // The whole `$…$` goes, dollars included; the closing `$` just typed is never added.
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex, display }))
          return undefined
        },
      })
    return [rule(/\$\$([^$\n]+?)\$\$$/u, true), rule(/(?<!\$)\$(?!\s)([^$\n]+?)(?<!\s)\$$/u, false)]
  },
  markdownTokenizer: {
    name: "math",
    level: "inline",
    start: (source) => source.indexOf("$"),
    tokenize: (source) => {
      const display = DISPLAY_MARKDOWN.exec(source)
      if (display) {
        return { type: "math", raw: display[0], latex: latexOf(display[1]), display: true }
      }
      const inline = INLINE_MARKDOWN.exec(source)
      if (!inline) return undefined
      return { type: "math", raw: inline[0], latex: latexOf(inline[1]), display: false }
    },
  },
  parseMarkdown: (token) => ({
    type: "math",
    attrs: {
      latex: latexOf(Reflect.get(token, "latex")),
      display: Reflect.get(token, "display") === true,
    },
  }),
  renderMarkdown: (node) => {
    const attrs: unknown = node.attrs
    const latex =
      typeof attrs === "object" && attrs !== null ? latexOf(Reflect.get(attrs, "latex")) : ""
    const display =
      typeof attrs === "object" && attrs !== null && Reflect.get(attrs, "display") === true
    return mathSource(latex, display)
  },
})
