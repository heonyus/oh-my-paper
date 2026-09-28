import type { Node as ProseNode } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/react"
import { type JSX, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { SourceCitation } from "../../lib/chatCitations"
import type { ScoredSource } from "../../lib/noteSources"
import type { SourceMatch, TutorEntry } from "../../lib/useNoteCompanion"
import { MarkdownContent } from "../MarkdownContent"
import { evidenceQuote } from "./evidenceNode"

const CARD_GAP = 8
const SNIPPET_CHARACTERS = 220
const MIN_EARLIER_KEY = 12

type Placement = {
  readonly pos: number
  readonly top: number
  readonly source: SourceMatch | null
  readonly tutor: TutorEntry | null
  /** The block has grown past the text the tutor answered. */
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

function tutorFor(
  text: string,
  tutors: readonly TutorEntry[],
): { readonly tutor: TutorEntry; readonly earlier: boolean } | null {
  let best: TutorEntry | null = null
  for (const tutor of tutors) {
    if (tutor.key === text) return { tutor, earlier: false }
    if (tutor.key.length >= MIN_EARLIER_KEY && text.startsWith(tutor.key)) {
      if (!best || tutor.key.length > best.key.length) best = tutor
    }
  }
  return best ? { tutor: best, earlier: true } : null
}

function placements(
  editor: Editor,
  match: SourceMatch | null,
  tutors: readonly TutorEntry[],
  column: HTMLElement,
): readonly Placement[] {
  const origin = column.getBoundingClientRect().top
  const result: Placement[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textContent.trim()
    const source = match && match.key === text ? match : null
    const found = tutorFor(text, tutors)
    if (!source && !found) return false
    const dom = editor.view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return false
    result.push({
      pos,
      top: dom.getBoundingClientRect().top - origin,
      source,
      tutor: found?.tutor ?? null,
      earlier: found?.earlier ?? false,
      attached: attachedQuotes(node),
    })
    return false
  })
  return result
}

function snippet(text: string): string {
  return text.length <= SNIPPET_CHARACTERS ? text : `${text.slice(0, SNIPPET_CHARACTERS).trim()}…`
}

function SourceCard({
  source,
  translation,
  attached,
  onAttach,
  onOpen,
}: {
  readonly source: ScoredSource
  readonly translation: string | null
  readonly attached: boolean
  readonly onAttach: () => void
  readonly onOpen: () => void
}): JSX.Element {
  return (
    <article className="note-margin-card" data-kind="source">
      <header>
        <span>원문</span>
        <button type="button" aria-label={`${source.page}쪽 원문 보기`} onClick={onOpen}>
          p.{source.page}
        </button>
      </header>
      {translation ? <p className="note-margin-translation">{snippet(translation)}</p> : null}
      <p className="note-margin-original" lang="en">
        {snippet(source.text)}
      </p>
      {attached ? (
        <span className="note-margin-attached">근거로 붙임</span>
      ) : (
        <button type="button" className="note-margin-attach" onClick={onAttach}>
          근거로 붙이기
        </button>
      )}
    </article>
  )
}

function TutorCard({
  tutor,
  expanded,
  onExpand,
  onCitation,
}: {
  readonly tutor: TutorEntry
  readonly expanded: boolean
  readonly onExpand: () => void
  readonly onCitation: (citation: SourceCitation) => void
}): JSX.Element {
  return (
    <article
      className="note-margin-card"
      data-kind="tutor"
      data-streaming={tutor.status === "streaming"}
    >
      <header>
        <span>튜터</span>
        {tutor.status === "streaming" ? (
          <span className="note-tutor-typing" role="status" aria-label="튜터가 쓰는 중" />
        ) : null}
      </header>
      {expanded ? (
        tutor.text ? (
          <MarkdownContent source={tutor.text} onCitation={onCitation} />
        ) : null
      ) : (
        <button type="button" className="note-tutor-folded" onClick={onExpand}>
          {tutor.text.replace(/\[\[[^\]]*\]\]/gu, "").slice(0, 48)}…
        </button>
      )}
    </article>
  )
}

/**
 * The margin beside the note: the source passage of the sentence being written, and the tutor's
 * remarks on each paragraph. Cards sit beside their block and never take focus.
 */
export function MarginColumn({
  editor,
  match,
  tutors,
  onAttach,
  onOpen,
  onCitation,
}: {
  readonly editor: Editor | null
  readonly match: SourceMatch | null
  readonly tutors: readonly TutorEntry[]
  readonly onAttach: (pos: number, source: ScoredSource) => void
  readonly onOpen: (page: number, text: string) => void
  readonly onCitation: (citation: SourceCitation) => void
}): JSX.Element {
  const column = useRef<HTMLElement>(null)
  const cards = useRef(new Map<number, HTMLElement>())
  const [layout, setLayout] = useState<readonly Placement[]>([])
  const [tops, setTops] = useState<ReadonlyMap<number, number>>(() => new Map())
  const [opened, setOpened] = useState<string | null>(null)
  const latestTutor = tutors.reduce<TutorEntry | null>(
    (latest, tutor) => (!latest || tutor.at > latest.at ? tutor : latest),
    null,
  )

  useEffect(() => {
    if (!editor) return
    let frame = 0
    const measure = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (column.current) setLayout(placements(editor, match, tutors, column.current))
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
  }, [editor, match, tutors])

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
      {layout.map((placement) => {
        const { source, tutor } = placement
        return (
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
            {source ? (
              <SourceCard
                source={source.source}
                translation={source.translation}
                attached={placement.attached.has(evidenceQuote(source.source.text))}
                onAttach={() => onAttach(placement.pos, source.source)}
                onOpen={() => onOpen(source.source.page, source.source.text)}
              />
            ) : null}
            {tutor ? (
              <TutorCard
                tutor={tutor}
                expanded={tutor === latestTutor || opened === tutor.key}
                onExpand={() => setOpened(tutor.key)}
                onCitation={onCitation}
              />
            ) : null}
          </div>
        )
      })}
    </aside>
  )
}
