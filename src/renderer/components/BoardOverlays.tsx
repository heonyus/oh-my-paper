import { Highlighter, Languages, MessageSquareText, Palette, StickyNote } from "lucide-react"
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
