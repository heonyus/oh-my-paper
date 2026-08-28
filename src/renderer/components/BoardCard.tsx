import { ExternalLink, GripVertical, Maximize2, MoreHorizontal, StickyNote, X } from "lucide-react"
import { type JSX, useRef } from "react"
import type { ReadingTier } from "../../shared/citationAssessment"
import { moveWorldPointByScreenDelta } from "../lib/viewport"
import type { BoardCard as Card, CardId } from "../types"

const readingTierLabel: Readonly<Record<ReadingTier, string>> = {
  deep_read: "정독",
  skim: "훑어보기",
  abstract_only: "초록만",
  pass: "패스",
}

type BoardCardProps = {
  readonly card: Card
  readonly onMove: (id: CardId, x: number, y: number) => void
  readonly onDelete: (id: CardId) => void
  readonly onJump: (page: number) => void
  readonly onConvertToNote?: ((id: CardId) => void) | undefined
  readonly active: boolean
  readonly onActiveChange: (id: CardId | null) => void
  readonly zoom: number
}
export function BoardCard({
  card,
  onMove,
  onDelete,
  onJump,
  onConvertToNote,
  active,
  onActiveChange,
  zoom,
}: BoardCardProps): JSX.Element {
  const start = useRef<{ x: number; y: number; cardX: number; cardY: number } | null>(null)
  return (
    <section
      className="board-card"
      style={{ left: card.x, top: card.y }}
      aria-label={`${card.title}, ${card.anchor.page} 페이지 연결 카드`}
      data-active={active}
      onPointerEnter={() => onActiveChange(card.id)}
      onPointerLeave={() => onActiveChange(null)}
      onFocusCapture={() => onActiveChange(card.id)}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return
        onActiveChange(null)
      }}
    >
      <header
        className="card-head"
        onPointerDown={(event) => {
          if (event.target instanceof Element && event.target.closest("button")) return
          start.current = { x: event.clientX, y: event.clientY, cardX: card.x, cardY: card.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const state = start.current
          if (state) {
            const point = moveWorldPointByScreenDelta(
              { x: state.cardX, y: state.cardY },
              { x: event.clientX - state.x, y: event.clientY - state.y },
              zoom,
            )
            onMove(card.id, point.x, point.y)
          }
        }}
        onPointerUp={() => {
          start.current = null
        }}
      >
        <GripVertical size={15} aria-hidden="true" />
        <strong>{card.title}</strong>
        <button
          type="button"
          aria-label="카드 메뉴"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={16} />
        </button>
        <button
          type="button"
          aria-label="카드 닫기"
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            onDelete(card.id)
          }}
        >
          <X size={16} />
        </button>
      </header>
      <div className="card-body">
        {card.sourceMeta ? (
          <div className="citation-card-meta">
            <strong>{card.sourceMeta.title}</strong>
            <span className="citation-card-secondary">
              {card.sourceMeta.authors.join(", ")}
              {card.sourceMeta.year ? ` · ${card.sourceMeta.year}` : ""}
            </span>
            {card.sourceMeta.venue ? (
              <span className="citation-card-secondary">{card.sourceMeta.venue}</span>
            ) : null}
            {card.sourceMeta.doi ? (
              <span className="citation-card-secondary">{`DOI: ${card.sourceMeta.doi}`}</span>
            ) : null}
            {card.sourceMeta.citationCount !== null ? (
              <span className="citation-card-secondary">{`인용 ${card.sourceMeta.citationCount}회`}</span>
            ) : null}
            {card.sourceMeta.assessment ? (
              <span
                className="reading-tier"
                data-tier={card.sourceMeta.assessment.tier}
              >{`${readingTierLabel[card.sourceMeta.assessment.tier]} · ${card.sourceMeta.assessment.score}`}</span>
            ) : null}
          </div>
        ) : null}
        <p>{card.body}</p>
        <div className="card-actions">
          {card.sourceUrl ? (
            <button
              type="button"
              className="source-link"
              onClick={() => void window.scourgify.openExternal({ url: card.sourceUrl ?? "" })}
            >
              논문 열기 <ExternalLink size={13} />
            </button>
          ) : null}
          {card.kind === "translation" && onConvertToNote ? (
            <button
              type="button"
              className="source-link"
              aria-label="번역을 주석으로 저장"
              onClick={() => onConvertToNote(card.id)}
            >
              주석으로 저장 <StickyNote size={13} />
            </button>
          ) : null}
          <button type="button" className="source-link" onClick={() => onJump(card.anchor.page)}>
            p. {card.anchor.page} 원문으로 이동 <Maximize2 size={13} />
          </button>
        </div>
      </div>
    </section>
  )
}
