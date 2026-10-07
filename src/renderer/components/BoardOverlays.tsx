import {
  Highlighter,
  Languages,
  MessageSquareText,
  NotebookPen,
  Palette,
  Trash2,
} from "lucide-react"
import type { CSSProperties, JSX } from "react"
import { connectorPath } from "../lib/board"
import type { HighlightFragment } from "../lib/boardHighlights"
import { useTranslator } from "../lib/locale"
import type { SelectionAction } from "../lib/selectionActions"
import { boardMessages } from "../messages/board"
import type { BoardCard } from "../types"

export type { SelectionAction } from "../lib/selectionActions"

export function SourceHighlights({
  fragments,
}: {
  readonly fragments: readonly HighlightFragment[]
}): JSX.Element {
  return (
    <>
      {fragments.map(({ key, fragment }) => (
        <span
          key={key}
          className="source-highlight"
          style={{
            left: fragment.x,
            top: fragment.y,
            width: fragment.width,
            height: fragment.height,
          }}
          aria-hidden="true"
        />
      ))}
    </>
  )
}

/**
 * Each highlight is one translucent group, so line boxes that overlap do not stack
 * into darker stripes.
 */
export function HighlightMarks({
  highlights,
  selectedId,
}: {
  readonly highlights: readonly BoardCard[]
  readonly selectedId: string | null
}): JSX.Element {
  return (
    <>
      {highlights.map((card) => (
        <span
          key={card.id}
          className="highlight-mark"
          data-highlight-id={card.id}
          data-selected={card.id === selectedId || undefined}
          aria-hidden="true"
        >
          {card.anchor.fragments.map((fragment) => (
            <span
              key={`${fragment.x}-${fragment.y}-${fragment.width}-${fragment.height}`}
              style={{
                left: fragment.x,
                top: fragment.y,
                width: fragment.width,
                height: fragment.height,
              }}
            />
          ))}
        </span>
      ))}
    </>
  )
}

/** Translated passages, tinted green; their text shows when the reader hovers one. */
export function TranslationMarks({
  translations,
  hoveredId,
}: {
  readonly translations: readonly BoardCard[]
  readonly hoveredId: string | null
}): JSX.Element {
  return (
    <>
      {translations.map((card) => (
        <span
          key={card.id}
          className="translation-mark"
          data-translation-id={card.id}
          data-hovered={card.id === hoveredId || undefined}
          data-loading={card.loading || undefined}
          aria-hidden="true"
        >
          {card.anchor.fragments.map((fragment) => (
            <span
              key={`${fragment.x}-${fragment.y}-${fragment.width}-${fragment.height}`}
              style={{
                left: fragment.x,
                top: fragment.y,
                width: fragment.width,
                height: fragment.height,
              }}
            />
          ))}
        </span>
      ))}
    </>
  )
}

export function HighlightToolbar({
  position,
  onDelete,
}: {
  readonly position: CSSProperties
  readonly onDelete: () => void
}): JSX.Element {
  const t = useTranslator(boardMessages)
  return (
    <div
      className="selection-menu highlight-menu"
      style={position}
      role="toolbar"
      aria-label={t("overlay.highlightActions")}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <button type="button" aria-keyshortcuts="Delete" onClick={onDelete}>
        <Trash2 size={14} /> {t("overlay.deleteHighlight")}
      </button>
    </div>
  )
}

export function ConnectorLayer({ cards }: { readonly cards: readonly BoardCard[] }): JSX.Element {
  return (
    <svg className="connector-layer" aria-hidden="true">
      {cards.map((card) => (
        <path key={card.id} d={connectorPath(card)} />
      ))}
    </svg>
  )
}

export function SelectionToolbar({
  position,
  onAction,
}: {
  readonly position: CSSProperties
  readonly onAction: (action: SelectionAction) => void
}): JSX.Element {
  const t = useTranslator(boardMessages)
  return (
    <div
      className="selection-menu"
      style={position}
      role="toolbar"
      aria-label={t("overlay.selectionActions")}
      onPointerDown={(event) => event.preventDefault()}
    >
      <button type="button" aria-keyshortcuts="T" onClick={() => onAction("translation")}>
        <Languages size={14} /> {t("overlay.translate")}
      </button>
      <button type="button" aria-keyshortcuts="E" onClick={() => onAction("explanation")}>
        <MessageSquareText size={14} /> {t("overlay.explain")}
      </button>
      <button type="button" aria-keyshortcuts="I" onClick={() => onAction("infographic")}>
        <Palette size={14} /> {t("overlay.infographic")}
      </button>
      <button type="button" aria-keyshortcuts="H" onClick={() => onAction("highlight")}>
        <Highlighter size={14} /> {t("overlay.highlight")}
      </button>
      <button type="button" aria-keyshortcuts="C" onClick={() => onAction("note")}>
        <NotebookPen size={14} /> {t("overlay.toNote")}
      </button>
    </div>
  )
}
