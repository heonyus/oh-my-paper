import type { Node as ProseNode } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/react"
import { type JSX, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { SourceCitation } from "../../lib/chatCitations"
import { useTranslator } from "../../lib/locale"
import { marginSnippet } from "../../lib/marginSnippet"
import type { ScoredSource } from "../../lib/noteSources"
import type { SourceMatch, TutorEntry } from "../../lib/useNoteCompanion"
import { noteMessages } from "../../messages/note"
import { MarkdownContent } from "../MarkdownContent"
import { evidenceQuote } from "./evidenceNode"
import { type MarginSlotRegistry, setMarginSlots } from "./marginSlots"

const MIN_EARLIER_KEY = 12

type Placement = {
  /** Where the block starts, and where its slot sits, right after it. */
  readonly pos: number
  readonly end: number
  readonly key: string
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
): readonly Placement[] {
  const result: Placement[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textContent.trim()
    const source = match && match.key === text ? match : null
    const found = tutorFor(text, tutors)
    if (!source && !found) return false
    result.push({
      pos,
      end: pos + node.nodeSize,
      key: `slot:${found?.tutor.key ?? source?.key ?? pos}`,
      source,
      tutor: found?.tutor ?? null,
      earlier: found?.earlier ?? false,
      attached: attachedQuotes(node),
    })
    return false
  })
  return result
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
  const t = useTranslator(noteMessages)
  return (
    <article className="note-margin-card" data-kind="source">
      <header>
        <span>{t("margin.source")}</span>
        <button
          type="button"
          aria-label={t("margin.viewSource", { page: source.page })}
          onClick={onOpen}
        >
          p.{source.page}
        </button>
      </header>
      {translation ? (
        <MarkdownContent className="note-margin-translation" source={marginSnippet(translation)} />
      ) : null}
      <p className="note-margin-original" lang="en">
        {marginSnippet(source.text)}
      </p>
      {attached ? (
        <span className="note-margin-attached">{t("margin.attached")}</span>
      ) : (
        <button type="button" className="note-margin-attach" onClick={onAttach}>
          {t("margin.attach")}
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
  const t = useTranslator(noteMessages)
  return (
    <article
      className="note-margin-card"
      data-kind="tutor"
      data-streaming={tutor.status === "streaming"}
    >
      <header>
        <span>{t("margin.tutor")}</span>
        {tutor.status === "streaming" ? (
          <span className="note-tutor-typing" role="status" aria-label={t("margin.tutorWriting")} />
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
 * The note's margin: the source passage of the sentence being written, and the tutor's remarks
 * on each paragraph, each shown right under its block. Cards never take focus.
 */
export function MarginColumn({
  editor,
  slots,
  match,
  tutors,
  onAttach,
  onOpen,
  onCitation,
}: {
  readonly editor: Editor | null
  readonly slots: MarginSlotRegistry
  readonly match: SourceMatch | null
  readonly tutors: readonly TutorEntry[]
  readonly onAttach: (pos: number, source: ScoredSource) => void
  readonly onOpen: (page: number, text: string) => void
  readonly onCitation: (citation: SourceCitation) => void
}): JSX.Element {
  const [layout, setLayout] = useState<readonly Placement[]>([])
  const [opened, setOpened] = useState<string | null>(null)
  const latestTutor = tutors.reduce<TutorEntry | null>(
    (latest, tutor) => (!latest || tutor.at > latest.at ? tutor : latest),
    null,
  )

  useEffect(() => {
    if (!editor) return
    let placed = ""
    const place = (): void => {
      const next = placements(editor, match, tutors)
      const signature = next.map((item) => `${item.key}@${item.end}`).join("|")
      setLayout(next)
      if (signature === placed) return
      placed = signature
      slots.keep(new Set(next.map((item) => item.key)))
      editor.view.dispatch(
        setMarginSlots(
          editor.state.tr,
          next.map((item) => ({ key: item.key, pos: item.end })),
        ),
      )
    }
    place()
    editor.on("update", place)
    return () => {
      editor.off("update", place)
    }
  }, [editor, match, tutors, slots])

  return (
    <>
      {layout.map((placement) => {
        const { source, tutor } = placement
        const target = slots.elements.get(placement.key)
        if (!target) return null
        return createPortal(
          <div className="note-margin-group" data-earlier={placement.earlier}>
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
          </div>,
          target,
          placement.key,
        )
      })}
    </>
  )
}
