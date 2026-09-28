import {
  Highlighter,
  Languages,
  MessageSquareText,
  Palette,
  StickyNote,
  Trash2,
} from "lucide-react"
import type { CSSProperties, JSX } from "react"
import type { HighlightFragment } from "../lib/boardHighlights"
import type { SelectionAction } from "../lib/selectionActions"
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

export function HighlightToolbar({
  position,
  onDelete,
}: {
  readonly position: CSSProperties
  readonly onDelete: () => void
}): JSX.Element {
  return (
    <div
      className="selection-menu highlight-menu"
      style={position}
      role="toolbar"
      aria-label="하이라이트 작업"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <button type="button" aria-keyshortcuts="Delete" onClick={onDelete}>
        <Trash2 size={14} /> 하이라이트 삭제
      </button>
    </div>
  )
}

export function ConnectorLayer({ cards }: { readonly cards: readonly BoardCard[] }): JSX.Element {
  return (
    <svg className="connector-layer" aria-hidden="true">
      {cards.map((card) => {
        const endY = card.y + 28
        const path = `M ${card.anchor.x} ${card.anchor.y} C ${card.anchor.x + 90} ${card.anchor.y}, ${card.x - 90} ${endY}, ${card.x} ${endY}`
        return <path key={card.id} d={path} />
      })}
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
  return (
    <div
      className="selection-menu"
      style={position}
      role="toolbar"
      aria-label="선택 작업"
      onPointerDown={(event) => event.preventDefault()}
    >
      <button type="button" aria-keyshortcuts="T" onClick={() => onAction("translation")}>
        <Languages size={14} /> 번역
      </button>
      <button type="button" aria-keyshortcuts="E" onClick={() => onAction("explanation")}>
        <MessageSquareText size={14} /> 설명
      </button>
      <button type="button" aria-keyshortcuts="I" onClick={() => onAction("infographic")}>
        <Palette size={14} /> 인포그래픽
      </button>
      <button type="button" aria-keyshortcuts="H" onClick={() => onAction("highlight")}>
        <Highlighter size={14} /> 하이라이트
      </button>
      <button type="button" aria-keyshortcuts="C" onClick={() => onAction("note")}>
        <StickyNote size={14} /> 주석
      </button>
    </div>
  )
}
