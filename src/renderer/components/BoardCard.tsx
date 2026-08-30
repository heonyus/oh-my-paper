import { ExternalLink, Maximize2, StickyNote } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import { initialResearchCardHeight } from "../lib/board"
import type { BoardCard as Card, CardId } from "../types"
import { BoardCardChat } from "./BoardCardChat"
import { BoardCardCitationMeta } from "./BoardCardCitationMeta"
import { BoardCardHeader } from "./BoardCardHeader"
import { MarkdownContent } from "./MarkdownContent"

type BoardCardProps = {
  readonly card: Card
  readonly onMove: (id: CardId, x: number, y: number) => void
  readonly onDelete: (id: CardId) => void
  readonly onJump: (page: number) => void
  readonly onConvertToNote?: ((id: CardId) => void) | undefined
  readonly onBodyChange?: ((id: CardId, body: string) => void) | undefined
  readonly onMinimize: (id: CardId) => void
  readonly onRegenerateTitle?: ((id: CardId) => void) | undefined
  readonly onResize: (id: CardId, width: number, height: number) => void
  readonly onChatChange: (id: CardId, messages: Card["chat"]) => void
  readonly onAsk: (card: Card, question: string, history: Card["chat"]) => Promise<string>
  readonly autoEdit?: boolean | undefined
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
  onBodyChange,
  onMinimize,
  onRegenerateTitle,
  onResize,
  onChatChange,
  onAsk,
  autoEdit = false,
  active,
  onActiveChange,
  zoom,
}: BoardCardProps): JSX.Element {
  const cardElement = useRef<HTMLElement>(null)
  const resizeStart = useRef<{
    readonly clientX: number
    readonly clientY: number
    readonly width: number
    readonly height: number
  } | null>(null)
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
  const supportsChat =
    card.kind === "explanation" || card.kind === "infographic" || card.kind === "citation"
  const sourceUrl =
    card.sourceUrl ??
    card.sourceMeta?.url ??
    (card.sourceMeta?.doi ? `https://doi.org/${card.sourceMeta.doi}` : null)
  const usesNaturalHeight = card.kind === "sticky" || card.kind === "highlight"
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
      aria-label={`${card.title}, ${card.anchor.page} 페이지 연결 카드`}
      data-active={active}
      data-kind={card.kind}
      data-minimized={card.minimized}
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
        onMinimize={onMinimize}
        onDelete={onDelete}
        onRegenerateTitle={onRegenerateTitle}
      />
      {!card.minimized ? (
        <div className="card-body" onWheel={(event) => event.stopPropagation()}>
          {card.loading ? (
            <span className="card-loading-bar" role="status" aria-label="AI 응답 생성 중" />
          ) : null}
          {card.sourceMeta ? <BoardCardCitationMeta meta={card.sourceMeta} /> : null}
          {card.kind === "sticky" && editing ? (
            <textarea
              ref={editor}
              className="post-it-editor"
              aria-label="포스트잇 내용"
              value={draft}
              placeholder="Markdown으로 메모하세요…"
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
              aria-label="포스트잇 내용"
              value={draft}
              placeholder="메모"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={finishEditing}
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
          ) : (
            <div className="card-markdown">{renderedBody}</div>
          )}
          {card.kind !== "sticky" ? (
            <div className="card-actions">
              {sourceUrl ? (
                <button
                  type="button"
                  className="source-link"
                  onClick={() => void window.scourgify.openExternal({ url: sourceUrl })}
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
              <button
                type="button"
                className="source-link"
                onClick={() => onJump(card.anchor.page)}
              >
                p. {card.anchor.page} 원문으로 이동 <Maximize2 size={13} />
              </button>
            </div>
          ) : null}
          {supportsChat && !card.loading ? (
            <BoardCardChat
              card={card}
              onChange={(messages) => onChatChange(card.id, messages)}
              onAsk={(question, history) => onAsk(card, question, history)}
            />
          ) : null}
        </div>
      ) : null}
      {!card.minimized ? (
        <button
          type="button"
          className="card-resize-handle"
          aria-label="카드 크기 조절"
          onPointerDown={(event) => {
            const bounds = cardElement.current?.getBoundingClientRect()
            if (!bounds) return
            resizeStart.current = {
              clientX: event.clientX,
              clientY: event.clientY,
              width: card.width,
              height: card.height ?? bounds.height / zoom,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const start = resizeStart.current
            if (!start) return
            const width = Math.min(
              720,
              Math.max(240, start.width + (event.clientX - start.clientX) / zoom),
            )
            const height = Math.min(
              900,
              Math.max(160, start.height + (event.clientY - start.clientY) / zoom),
            )
            onResize(card.id, width, height)
          }}
          onPointerUp={() => {
            resizeStart.current = null
          }}
        />
      ) : null}
    </section>
  )
}
