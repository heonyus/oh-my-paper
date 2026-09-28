import { mergeAttributes, Node } from "@tiptap/core"

/** `[[p.12 | verbatim phrase]]`, the citation form the rest of the app already renders. */
const EVIDENCE_MARKDOWN = /^\[\[\s*p\.?\s*(\d{1,4})\s*\|\s*([^\]\n]{1,300}?)\s*\]\]/u
const QUOTE_MAX_CHARACTERS = 160

export type EvidenceAttributes = { readonly page: number; readonly quote: string }

/** A quote that stays one valid `[[p.N | …]]` citation: no brackets, pipes or line breaks. */
export function evidenceQuote(text: string): string {
  const flat = text
    .replace(/[[\]|]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
  if (flat.length <= QUOTE_MAX_CHARACTERS) return flat
  const cut = flat.slice(0, QUOTE_MAX_CHARACTERS)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim()
}

function pageOf(value: unknown): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

/**
 * An inline, uneditable chip linking a sentence of the reader's note to the source passage
 * it rests on. Only the reader inserts one; it serializes to the app's citation Markdown.
 */
export const EvidenceNode = Node.create({
  name: "evidence",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      page: {
        default: 1,
        parseHTML: (element) => pageOf(element.getAttribute("data-page")),
      },
      quote: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-quote") ?? "",
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-evidence]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const page = pageOf(Reflect.get(node.attrs, "page"))
    const quote = String(Reflect.get(node.attrs, "quote") ?? "")
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-evidence": "",
        "data-page": String(page),
        "data-quote": quote,
        class: "note-evidence",
        title: quote,
      }),
      `p.${page}`,
    ]
  },
  renderText({ node }) {
    return ` [p.${pageOf(Reflect.get(node.attrs, "page"))}]`
  },
  markdownTokenizer: {
    name: "evidence",
    level: "inline",
    start: (source) => source.indexOf("[["),
    tokenize: (source) => {
      const match = EVIDENCE_MARKDOWN.exec(source)
      if (!match) return undefined
      return {
        type: "evidence",
        raw: match[0],
        page: pageOf(match[1]),
        quote: evidenceQuote(match[2] ?? ""),
      }
    },
  },
  parseMarkdown: (token) => ({
    type: "evidence",
    attrs: {
      page: pageOf(Reflect.get(token, "page")),
      quote: evidenceQuote(String(Reflect.get(token, "quote") ?? "")),
    },
  }),
  renderMarkdown: (node) => {
    const attrs: unknown = node.attrs
    const page = typeof attrs === "object" && attrs !== null ? Reflect.get(attrs, "page") : 1
    const quote = typeof attrs === "object" && attrs !== null ? Reflect.get(attrs, "quote") : ""
    return `[[p.${pageOf(page)} | ${evidenceQuote(String(quote ?? ""))}]]`
  },
})
