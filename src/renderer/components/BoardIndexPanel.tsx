import {
  ArrowUpRight,
  Highlighter,
  Languages,
  MessageSquareText,
  NotebookPen,
  Palette,
  StickyNote,
} from "lucide-react"
import type { JSX } from "react"
import { conciseCardTitle } from "../lib/cardPresentation"
import { useTranslator } from "../lib/locale"
import { type BoardMessageKey, boardMessages } from "../messages/board"
import type { BoardCard, CardId } from "../types"

export type BoardCategoryKind = Exclude<BoardCard["kind"], "citation">

type CategoryCopy = {
  readonly purpose: BoardMessageKey
  readonly empty: BoardMessageKey
  readonly action: BoardMessageKey | null
}

const categoryCopy: Readonly<Record<BoardCategoryKind, CategoryCopy>> = {
  translation: {
    purpose: "index.translation.purpose",
    empty: "index.translation.empty",
    action: "index.translation.action",
  },
  explanation: {
    purpose: "index.explanation.purpose",
    empty: "index.explanation.empty",
    action: "index.explanation.action",
  },
  infographic: {
    purpose: "index.infographic.purpose",
    empty: "index.infographic.empty",
    action: "index.infographic.action",
  },
  note: {
    purpose: "index.note.purpose",
    empty: "index.note.empty",
    action: null,
  },
  sticky: {
    purpose: "index.sticky.purpose",
    empty: "index.sticky.empty",
    action: null,
  },
  highlight: {
    purpose: "index.highlight.purpose",
    empty: "index.highlight.empty",
    action: "index.highlight.action",
  },
}

function KindIcon({ kind, size }: { readonly kind: BoardCategoryKind; readonly size: number }) {
  switch (kind) {
    case "translation":
      return <Languages size={size} />
    case "explanation":
      return <MessageSquareText size={size} />
    case "infographic":
      return <Palette size={size} />
    case "note":
      return <NotebookPen size={size} />
    case "sticky":
      return <StickyNote size={size} />
    case "highlight":
      return <Highlighter size={size} />
  }
}

function plainPreview(value: string): string {
  return value
    .replace(/[#*_>`]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
}

function boundedPreview(value: string, maximum: number): string {
  const plain = plainPreview(value)
  if (plain.length <= maximum) return plain
  const candidate = plain.slice(0, maximum)
  const boundary = candidate.lastIndexOf(" ")
  return `${candidate.slice(0, boundary > maximum * 0.7 ? boundary : maximum).trim()}…`
}

function previewFor(card: BoardCard, kind: BoardCategoryKind, emptySticky: string): string {
  switch (kind) {
    case "translation":
    case "explanation":
    case "note":
      return plainPreview(card.body) || card.anchor.quote
    case "infographic":
      return boundedPreview(card.body, 280) || card.anchor.quote
    case "sticky":
      return plainPreview(card.body) || emptySticky
    case "highlight":
      return plainPreview(card.body) || card.anchor.quote
  }
}

function sourceFor(card: BoardCard, kind: BoardCategoryKind): string | null {
  switch (kind) {
    case "translation":
    case "explanation":
    case "infographic":
    case "note":
      return card.anchor.quote
    case "sticky":
      return null
    case "highlight":
      return card.anchor.quote
  }
}

export function BoardIndexPanel({
  cards,
  kind,
  label,
  onJump,
}: {
  readonly cards: readonly BoardCard[]
  readonly kind: BoardCategoryKind
  readonly label: string
  readonly onJump: (id: CardId) => void
}): JSX.Element {
  const t = useTranslator(boardMessages)
  const visible = cards.filter((card) => card.kind === kind)
  const copy = categoryCopy[kind]
  const action = copy.action ? t(copy.action) : null
  return (
    <section
      className="sidebar-mode-panel board-category-panel"
      data-kind={kind}
      aria-label={t("index.label", { label })}
    >
      <header className="mode-panel-head">
        <div>
          <KindIcon kind={kind} size={18} />
          <h2>{label}</h2>
        </div>
        <span>{visible.length}</span>
      </header>
      <p className="board-category-purpose">{t(copy.purpose)}</p>
      {visible.length > 0 ? (
        <ol className="board-index-list">
          {visible.map((card) => {
            const source = sourceFor(card, kind)
            const showsItemIdentity = kind !== "highlight"
            return (
              <li key={card.id} data-kind={kind}>
                <button
                  type="button"
                  data-kind={kind}
                  aria-label={`${card.title}, p.${card.anchor.page}${action ? `, ${action}` : ""}`}
                  onClick={() => onJump(card.id)}
                >
                  {showsItemIdentity ? (
                    <>
                      <span className="board-index-icon">
                        <KindIcon kind={kind} size={20} />
                      </span>
                      <strong className="board-index-title">
                        {conciseCardTitle(card.title, card.title)}
                      </strong>
                    </>
                  ) : null}
                  <span className="board-index-page">p.{card.anchor.page}</span>
                  <span className="board-index-preview">
                    {previewFor(card, kind, t("index.emptySticky"))}
                  </span>
                  {source ? (
                    <span className="board-index-source">
                      <small>{t("index.source")}</small>
                      <span>{source}</span>
                    </span>
                  ) : null}
                  {action ? (
                    <span className="board-index-action">
                      {action} <ArrowUpRight size={12} />
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="board-category-empty">
          <span className="board-category-empty-icon">
            <KindIcon kind={kind} size={22} />
          </span>
          <strong>{t("index.nothingSaved")}</strong>
          <p>{t(copy.empty)}</p>
        </div>
      )}
    </section>
  )
}
