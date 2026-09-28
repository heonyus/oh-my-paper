import type { Node as ProseNode } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/react"
import { type JSX, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { MarginSuggestion } from "../../lib/marginSuggestions"
import { type MarginEntry, MIN_NOTE_CHARACTERS } from "../../lib/useMarginSuggestions"
import { evidenceQuote } from "./evidenceNode"

const CARD_GAP = 8
const SNIPPET_CHARACTERS = 220

type Placement = {
  readonly key: string
  readonly pos: number
  readonly top: number
  readonly entry: MarginEntry
  /** The block has grown past the text these suggestions were made for. */
  readonly earlier: boolean
  readonly attached: ReadonlySet<string>
}

function attachedQuotes(node: ProseNode): ReadonlySet<string> {
  const quotes = new Set<string>()
  node.forEach((child) => {
    if (child.type.name === "evidence") quotes.add(String(Reflect.get(child.attrs, "quote")))
  })
  return quotes
}

function entryFor(
  text: string,
  entries: ReadonlyMap<string, MarginEntry>,
): { readonly key: string; readonly entry: MarginEntry; readonly earlier: boolean } | null {
  const exact = entries.get(text)
  if (exact) return { key: text, entry: exact, earlier: false }
  let best: { readonly key: string; readonly entry: MarginEntry } | null = null
  for (const [key, entry] of entries) {
    if (entry.status !== "ready" || key.length < MIN_NOTE_CHARACTERS || !text.startsWith(key))
      continue
    if (!best || key.length > best.key.length) best = { key, entry }
  }
  return best ? { ...best, earlier: true } : null
}

function placements(
  editor: Editor,
  entries: ReadonlyMap<string, MarginEntry>,
  column: HTMLElement,
): readonly Placement[] {
  const origin = column.getBoundingClientRect().top
  const result: Placement[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const found = entryFor(node.textContent.trim(), entries)
    if (!found || found.entry.status === "failed") return false
    if (found.entry.status === "ready" && found.entry.suggestions.length === 0) return false
    const dom = editor.view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return false
    result.push({
      ...found,
      pos,
      top: dom.getBoundingClientRect().top - origin,
      attached: attachedQuotes(node),
    })
    return false
  })
  return result
}

function snippet(text: string): string {
  return text.length <= SNIPPET_CHARACTERS ? text : `${text.slice(0, SNIPPET_CHARACTERS).trim()}…`
}

/**
 * Suggestions beside the block they belong to, like comments in a document. Cards never take
 * focus; the reader decides whether a passage becomes evidence in their note.
 */
export function MarginColumn({
  editor,
  entries,
  onAttach,
  onOpen,
}: {
  readonly editor: Editor | null
  readonly entries: ReadonlyMap<string, MarginEntry>
  readonly onAttach: (pos: number, suggestion: MarginSuggestion) => void
  readonly onOpen: (page: number, text: string) => void
}): JSX.Element {
  const column = useRef<HTMLElement>(null)
  const cards = useRef(new Map<number, HTMLElement>())
  const [layout, setLayout] = useState<readonly Placement[]>([])
  const [tops, setTops] = useState<ReadonlyMap<number, number>>(() => new Map())

  useEffect(() => {
    if (!editor) return
    let frame = 0
    const measure = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (column.current) setLayout(placements(editor, entries, column.current))
      })
    }
    measure()
    editor.on("update", measure)
    window.addEventListener("resize", measure)
    return () => {
      window.cancelAnimationFrame(frame)
      editor.off("update", measure)
      window.removeEventListener("resize", measure)
    }
  }, [editor, entries])

  useLayoutEffect(() => {
    const next = new Map<number, number>()
    let bottom = Number.NEGATIVE_INFINITY
    for (const placement of layout) {
      const top = Math.max(placement.top, bottom + CARD_GAP)
      next.set(placement.pos, top)
      bottom = top + (cards.current.get(placement.pos)?.offsetHeight ?? 0)
    }
    setTops(next)
  }, [layout])

  return (
    <aside ref={column} className="note-margin" aria-label="여백">
      {layout.map((placement) => (
        <div
          key={placement.pos}
          ref={(element) => {
            if (element) cards.current.set(placement.pos, element)
            else cards.current.delete(placement.pos)
          }}
          className="note-margin-group"
          data-earlier={placement.earlier}
          style={{ top: tops.get(placement.pos) ?? placement.top }}
        >
          {placement.entry.status === "loading" ? (
            <p className="note-margin-loading" role="status">
              근거 찾는 중
            </p>
          ) : placement.entry.status === "ready" ? (
            placement.entry.suggestions.map((suggestion) => (
              <article
                key={`${suggestion.kind}:${suggestion.page}:${suggestion.text.slice(0, 40)}`}
                className="note-margin-card"
                data-kind={suggestion.kind}
              >
                <header>
                  <span>{suggestion.kind === "support" ? "근거" : "어긋날 수 있는 구절"}</span>
                  <button
                    type="button"
                    aria-label={`${suggestion.page}쪽 원문 보기`}
                    onClick={() => onOpen(suggestion.page, suggestion.text)}
                  >
                    p.{suggestion.page}
                  </button>
                </header>
                <p>{snippet(suggestion.text)}</p>
                {suggestion.kind === "support" ? (
                  placement.attached.has(evidenceQuote(suggestion.text)) ? (
                    <span className="note-margin-attached">근거로 붙임</span>
                  ) : (
                    <button
                      type="button"
                      className="note-margin-attach"
                      onClick={() => onAttach(placement.pos, suggestion)}
                    >
                      근거로 붙이기
                    </button>
                  )
                ) : null}
              </article>
            ))
          ) : null}
        </div>
      ))}
    </aside>
  )
}
