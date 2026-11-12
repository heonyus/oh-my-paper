import { type JSX, memo, useRef } from "react"
import { initialResearchCardHeight } from "../lib/board"
import { infographicHtml } from "../lib/infographicHtml"
import { useTranslator } from "../lib/locale"
import { boardMessages } from "../messages/board"
import type { AiDeltaHandler, BoardCard as Card, CardId } from "../types"
import { BoardCardChat } from "./BoardCardChat"
import { BoardCardCitationMeta } from "./BoardCardCitationMeta"
import { BoardCardFooter } from "./BoardCardFooter"
import { BoardCardHeader } from "./BoardCardHeader"
import { BoardCardResizeHandle } from "./BoardCardResizeHandle"
import { InfographicFrame } from "./InfographicFrame"
import { MarkdownContent } from "./MarkdownContent"
import { Memo } from "./Memo"
import { NoteCardBody } from "./NoteCardBody"

type BoardCardProps = {
  readonly card: Card
  readonly onMove: (id: CardId, x: number, y: number) => void
  readonly onMoveEnd?: ((id: CardId, x: number, y: number) => void) | undefined
  readonly onDelete: (id: CardId) => void
  readonly onJump: (page: number) => void
  readonly onBodyChange?: ((id: CardId, body: string) => void) | undefined
  /** Focus has left the card altogether. */
  readonly onLeave?: ((id: CardId) => void) | undefined
  readonly onMinimize: (id: CardId) => void
  readonly onRegenerateTitle?: ((id: CardId) => void) | undefined
  readonly onResize: (id: CardId, width: number, height: number) => void
  readonly onResizeEnd?: ((id: CardId, width: number, height: number) => void) | undefined
  readonly onChatChange: (id: CardId, messages: Card["chat"]) => void
  readonly onAsk: (
    card: Card,
    question: string,
    history: Card["chat"],
    onDelta?: AiDeltaHandler,
  ) => Promise<string>
  readonly autoEdit?: boolean | undefined
  readonly streaming?: boolean | undefined
  readonly active: boolean
  readonly onActiveChange: (id: CardId | null) => void
  readonly zoom: number
}
/** Drawn again only when its own card, state or handlers change, not when the board around it is. */
export const BoardCard = memo(function BoardCard({
  card,
  onMove,
  onMoveEnd,
  onDelete,
  onJump,
  onBodyChange,
  onLeave,
  onMinimize,
  onRegenerateTitle,
  onResize,
  onResizeEnd,
  onChatChange,
  onAsk,
  autoEdit = false,
  streaming = false,
  active,
  onActiveChange,
  zoom,
}: BoardCardProps): JSX.Element {
  const t = useTranslator(boardMessages)
  const cardElement = useRef<HTMLElement>(null)
  const renderedBody = <MarkdownContent source={card.body} />
  const html = card.kind === "infographic" && !card.loading ? infographicHtml(card.body) : null
  const supportsChat =
    card.kind === "explanation" || card.kind === "infographic" || card.kind === "citation"
  const usesNaturalHeight =
    card.kind === "sticky" || card.kind === "highlight" || card.kind === "note"
  const expandedHeight = card.height ?? (usesNaturalHeight ? null : initialResearchCardHeight(card))

  return (
    <section
      ref={cardElement}
      className="board-card"
      style={{
        left: card.x,
        top: card.y,
        width: card.minimized ? 240 : card.width,
        ...(card.minimized || expandedHeight === null ? {} : { height: expandedHeight }),
      }}
      aria-label={t("card.label", { title: card.title, page: card.anchor.page })}
      data-active={active}
      data-kind={card.kind}
      data-minimized={card.minimized}
      data-streaming={streaming}
      onPointerDown={() => onActiveChange(card.id)}
      onFocusCapture={() => onActiveChange(card.id)}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return
        onActiveChange(null)
        onLeave?.(card.id)
      }}
    >
      <BoardCardHeader
        card={card}
        zoom={zoom}
        onMove={onMove}
        onMoveEnd={onMoveEnd ?? onMove}
        onMinimize={onMinimize}
        onDelete={onDelete}
        // The reader's own memos and note cards are never retitled by AI.
        onRegenerateTitle={
          card.kind === "translation" || card.kind === "note" || card.kind === "sticky"
            ? undefined
            : onRegenerateTitle
        }
      />
      {!card.minimized ? (
        <div
          className="card-body"
          // A note left on the board lets the wheel scroll the pages under it.
          onWheel={card.kind === "sticky" ? undefined : (event) => event.stopPropagation()}
        >
          {card.loading ? (
            <span className="card-loading-bar" role="status" aria-label={t("card.generating")} />
          ) : null}
          {card.sourceMeta ? <BoardCardCitationMeta meta={card.sourceMeta} /> : null}
          {card.kind === "sticky" ? (
            <Memo
              markdown={card.body}
              onChange={(body) => onBodyChange?.(card.id, body)}
              placeholder={t("card.stickyPlaceholder")}
              ariaLabel={t("card.stickyContent")}
              autoFocus={autoEdit}
            />
          ) : card.kind === "note" ? (
            <NoteCardBody
              card={card}
              autoEdit={autoEdit}
              onBodyChange={(body) => onBodyChange?.(card.id, body)}
            />
          ) : html ? (
            <InfographicFrame html={html} title={card.title} />
          ) : (
            <div className="card-markdown">{renderedBody}</div>
          )}
          {supportsChat && !card.loading ? (
            <BoardCardChat
              card={card}
              onChange={(messages) => onChatChange(card.id, messages)}
              onAsk={(question, history, onDelta) => onAsk(card, question, history, onDelta)}
              onCitation={(citation) => onJump(citation.page)}
            />
          ) : null}
        </div>
      ) : null}
      {!card.minimized && card.kind !== "sticky" ? (
        <BoardCardFooter card={card} streaming={streaming} onJump={onJump} />
      ) : null}
      {!card.minimized ? (
        <BoardCardResizeHandle
          id={card.id}
          width={card.width}
          height={card.height ?? expandedHeight ?? 420}
          zoom={zoom}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
        />
      ) : null}
    </section>
  )
})
