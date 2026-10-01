import { type JSX, useEffect, useRef, useState } from "react"
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
import { NoteCardBody } from "./NoteCardBody"

type BoardCardProps = {
  readonly card: Card
  readonly onMove: (id: CardId, x: number, y: number) => void
  readonly onMoveEnd?: ((id: CardId, x: number, y: number) => void) | undefined
  readonly onDelete: (id: CardId) => void
  readonly onJump: (page: number) => void
  readonly onSaveAsAnnotation?: ((id: CardId) => void) | undefined
  readonly onBodyChange?: ((id: CardId, body: string) => void) | undefined
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
export function BoardCard({
  card,
  onMove,
  onMoveEnd,
  onDelete,
  onJump,
  onSaveAsAnnotation,
  onBodyChange,
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
  const editor = useRef<HTMLTextAreaElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.body)

  useEffect(() => {
    if (autoEdit) setEditing(true)
  }, [autoEdit])

  useEffect(() => {
    if (editing) editor.current?.focus()
  }, [editing])

  useEffect(() => {
    setDraft(card.body)
  }, [card.body])

  function finishEditing(): void {
    onBodyChange?.(card.id, draft)
    setEditing(false)
  }

  const renderedBody = <MarkdownContent source={card.kind === "sticky" ? draft : card.body} />
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
          {card.kind === "sticky" && editing ? (
            <textarea
              ref={editor}
              className="post-it-editor"
              aria-label={t("card.stickyContent")}
              value={draft}
              placeholder={t("card.stickyPlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={finishEditing}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.currentTarget.blur()
                } else if (event.key === "Escape") {
                  setDraft(card.body)
                  setEditing(false)
                }
              }}
            />
          ) : card.kind === "sticky" && draft.trim() === "" ? (
            <textarea
              ref={editor}
              className="post-it-editor"
              aria-label={t("card.stickyContent")}
              value={draft}
              placeholder={t("card.stickyEmptyPlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={finishEditing}
            />
          ) : card.kind === "note" ? (
            <NoteCardBody
              card={card}
              autoEdit={autoEdit}
              onBodyChange={(body) => onBodyChange?.(card.id, body)}
            />
          ) : card.kind === "sticky" ? (
            <button
              type="button"
              className="card-markdown post-it-preview"
              onDoubleClick={() => {
                setDraft(card.body)
                setEditing(true)
              }}
            >
              {renderedBody}
            </button>
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
        <BoardCardFooter
          card={card}
          streaming={streaming}
          onJump={onJump}
          onSaveAsAnnotation={onSaveAsAnnotation}
        />
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
}
