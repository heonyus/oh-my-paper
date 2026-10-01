import {
  ArrowUpRight,
  Highlighter,
  Languages,
  Layers,
  MessageSquareText,
  NotebookPen,
  Palette,
} from "lucide-react"
import type { JSX, ReactNode } from "react"
import { conciseCardTitle } from "../lib/cardPresentation"
import { useTranslator } from "../lib/locale"
import { type BoardMessageKey, boardMessages } from "../messages/board"
import type { BoardCard, CardId } from "../types"

export type BoardCategoryKind = Exclude<BoardCard["kind"], "citation" | "sticky">
/** A category, or every card on the board at once. */
export type BoardIndexFilter = BoardCategoryKind | "all"

/**
 * The category a card is listed under. Sticky notes are no longer made (note cards go into the
 * reader's note), so the ones already on a board are listed with the memos; citation cards are
 * read in the related papers panel instead.
 */
function categoryOf(card: BoardCard): BoardCategoryKind | null {
  if (card.kind === "citation") return null
  return card.kind === "sticky" ? "note" : card.kind
}

/** The cards a filter lists; every card is shown in page order, as it sits on the board. */
export function cardsInCategory(
  cards: readonly BoardCard[],
  filter: BoardIndexFilter,
): readonly BoardCard[] {
  if (filter !== "all") return cards.filter((card) => categoryOf(card) === filter)
  return cards
    .filter((card) => categoryOf(card) !== null)
    .sort((left, right) => left.anchor.page - right.anchor.page || left.y - right.y)
}

type CategoryCopy = {
  readonly purpose: BoardMessageKey
  readonly empty: BoardMessageKey
  readonly action: BoardMessageKey | null
}

const categoryCopy: Readonly<Record<BoardIndexFilter, CategoryCopy>> = {
  all: { purpose: "index.all.purpose", empty: "index.all.empty", action: null },
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
  highlight: {
    purpose: "index.highlight.purpose",
    empty: "index.highlight.empty",
    action: "index.highlight.action",
  },
}

function KindIcon({ kind, size }: { readonly kind: BoardIndexFilter; readonly size: number }) {
  switch (kind) {
    case "all":
      return <Layers size={size} />
    case "translation":
      return <Languages size={size} />
    case "explanation":
      return <MessageSquareText size={size} />
    case "infographic":
      return <Palette size={size} />
    case "note":
      return <NotebookPen size={size} />
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
  if (card.kind === "sticky") return plainPreview(card.body) || emptySticky
  switch (kind) {
    case "translation":
    case "explanation":
    case "note":
    case "highlight":
      return plainPreview(card.body) || card.anchor.quote
    case "infographic":
      return boundedPreview(card.body, 280) || card.anchor.quote
  }
}

/** A sticky note was placed on the board, not on a passage, so it has no source to show. */
function sourceFor(card: BoardCard): string | null {
  return card.kind === "sticky" ? null : card.anchor.quote
}

export function BoardIndexPanel({
  cards,
  kind,
  label,
  onJump,
  toolbar,
}: {
  readonly cards: readonly BoardCard[]
  readonly kind: BoardIndexFilter
  readonly label: string
  readonly onJump: (id: CardId) => void
  /** Controls shown under the heading, such as the card type filter. */
  readonly toolbar?: ReactNode
}): JSX.Element {
  const t = useTranslator(boardMessages)
  const visible = cardsInCategory(cards, kind)
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
      {toolbar}
      <p className="board-category-purpose">{t(categoryCopy[kind].purpose)}</p>
      {visible.length > 0 ? (
        <ol className="board-index-list">
          {visible.map((card) => {
            const itemKind = categoryOf(card) ?? "note"
            const actionKey = categoryCopy[itemKind].action
            const action = actionKey ? t(actionKey) : null
            const source = sourceFor(card)
            const showsItemIdentity = itemKind !== "highlight"
            const styleKind = card.kind === "sticky" ? "sticky" : itemKind
            return (
              <li key={card.id} data-kind={styleKind}>
                <button
                  type="button"
                  data-kind={itemKind}
                  aria-label={`${card.title}, p.${card.anchor.page}${action ? `, ${action}` : ""}`}
                  onClick={() => onJump(card.id)}
                >
                  {showsItemIdentity ? (
                    <>
                      <span className="board-index-icon">
                        <KindIcon kind={itemKind} size={20} />
                      </span>
                      <strong className="board-index-title">
                        {conciseCardTitle(card.title, card.title)}
                      </strong>
                    </>
                  ) : null}
                  <span className="board-index-page">p.{card.anchor.page}</span>
                  <span className="board-index-preview">
                    {previewFor(card, itemKind, t("index.emptySticky"))}
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
          <p>{t(categoryCopy[kind].empty)}</p>
        </div>
      )}
    </section>
  )
}
