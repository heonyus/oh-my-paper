import { Check, Copy, ExternalLink, Maximize2, StickyNote } from "lucide-react"
import { type JSX, useEffect, useState } from "react"
import type { BoardCard, CardId } from "../types"

export function BoardCardFooter({
  card,
  streaming,
  onJump,
  onSaveAsAnnotation,
}: {
  readonly card: BoardCard
  readonly streaming: boolean
  readonly onJump: (page: number) => void
  readonly onSaveAsAnnotation?: ((id: CardId) => void) | undefined
}): JSX.Element {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  useEffect(() => {
    if (card.body) setCopyState("idle")
  }, [card.body])

  async function copyCardBody(): Promise<void> {
    try {
      await window.ohmypaper.writeClipboardText(card.body)
      setCopyState("copied")
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error
      setCopyState("failed")
    }
  }

  const sourceUrl =
    card.sourceUrl ??
    card.sourceMeta?.url ??
    (card.sourceMeta?.doi ? `https://doi.org/${card.sourceMeta.doi}` : null)
  return (
    <footer className="card-source-footer">
      {!card.loading && !streaming && card.body.trim() ? (
        <button
          type="button"
          className="source-link card-copy-action"
          data-state={copyState}
          aria-label={
            copyState === "copied"
              ? "카드 내용 복사됨"
              : copyState === "failed"
                ? "카드 내용 복사 실패"
                : "카드 내용 복사"
          }
          onClick={() => void copyCardBody()}
        >
          {copyState === "copied" ? "복사됨" : copyState === "failed" ? "복사 실패" : "복사"}
          {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
        </button>
      ) : null}
      {sourceUrl ? (
        <button
          type="button"
          className="source-link"
          onClick={() => void window.ohmypaper.openExternal({ url: sourceUrl })}
        >
          논문 열기 <ExternalLink size={13} />
        </button>
      ) : null}
      {card.kind === "translation" && onSaveAsAnnotation ? (
        <button
          type="button"
          className="source-link"
          aria-label="번역을 주석으로 저장"
          onClick={() => onSaveAsAnnotation(card.id)}
        >
          주석으로 저장 <StickyNote size={13} />
        </button>
      ) : null}
      <button
        type="button"
        className="source-link source-jump"
        onClick={() => onJump(card.anchor.page)}
      >
        p. {card.anchor.page} 원문으로 이동 <Maximize2 size={13} />
      </button>
    </footer>
  )
}
