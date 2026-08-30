import { GripVertical, Maximize2, Minus, RefreshCw, X } from "lucide-react"
import { type JSX, useRef } from "react"
import { conciseCardTitle } from "../lib/cardPresentation"
import { moveWorldPointByScreenDelta } from "../lib/viewport"
import type { BoardCard, CardId } from "../types"

export function BoardCardHeader({
  card,
  zoom,
  onMove,
  onMinimize,
  onDelete,
  onRegenerateTitle,
}: {
  readonly card: BoardCard
  readonly zoom: number
  readonly onMove: (id: CardId, x: number, y: number) => void
  readonly onMinimize: (id: CardId) => void
  readonly onDelete: (id: CardId) => void
  readonly onRegenerateTitle?: ((id: CardId) => void) | undefined
}): JSX.Element {
  const start = useRef<{ x: number; y: number; cardX: number; cardY: number } | null>(null)
  return (
    <header
      className="card-head"
      onPointerDown={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) return
        start.current = { x: event.clientX, y: event.clientY, cardX: card.x, cardY: card.y }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const state = start.current
        if (!state) return
        const point = moveWorldPointByScreenDelta(
          { x: state.cardX, y: state.cardY },
          { x: event.clientX - state.x, y: event.clientY - state.y },
          zoom,
        )
        onMove(card.id, point.x, point.y)
      }}
      onPointerUp={() => {
        start.current = null
      }}
    >
      <GripVertical size={15} aria-hidden="true" />
      <strong>{conciseCardTitle(card.title, card.title)}</strong>
      {onRegenerateTitle && !card.minimized ? (
        <button
          type="button"
          aria-label="카드 제목 다시 생성"
          title="제목 다시 생성"
          disabled={card.loading}
          onClick={() => onRegenerateTitle(card.id)}
        >
          <RefreshCw size={14} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={card.minimized ? "카드 펼치기" : "카드 최소화"}
        onClick={() => onMinimize(card.id)}
      >
        {card.minimized ? <Maximize2 size={15} /> : <Minus size={16} />}
      </button>
      <button type="button" aria-label="카드 닫기" onClick={() => onDelete(card.id)}>
        <X size={16} />
      </button>
    </header>
  )
}
