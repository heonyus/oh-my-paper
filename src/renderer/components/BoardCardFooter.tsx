import { Check, Copy, ExternalLink, Maximize2, StickyNote } from "lucide-react"
import { type JSX, useEffect, useState } from "react"
import { useTranslator } from "../lib/locale"
import { boardMessages } from "../messages/board"
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
  const t = useTranslator(boardMessages)
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
              ? t("card.copiedLabel")
              : copyState === "failed"
                ? t("card.copyFailedLabel")
                : t("card.copyLabel")
          }
          onClick={() => void copyCardBody()}
        >
          {copyState === "copied"
            ? t("card.copied")
            : copyState === "failed"
              ? t("card.copyFailed")
              : t("card.copy")}
          {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
        </button>
      ) : null}
      {sourceUrl ? (
        <button
          type="button"
          className="source-link"
          onClick={() => void window.ohmypaper.openExternal({ url: sourceUrl })}
        >
          {t("card.openPaper")} <ExternalLink size={13} />
        </button>
      ) : null}
      {card.kind === "translation" && onSaveAsAnnotation ? (
        <button
          type="button"
          className="source-link"
          aria-label={t("card.saveAsAnnotationLabel")}
          onClick={() => onSaveAsAnnotation(card.id)}
        >
          {t("card.saveAsAnnotation")} <StickyNote size={13} />
        </button>
      ) : null}
      <button
        type="button"
        className="source-link source-jump"
        onClick={() => onJump(card.anchor.page)}
      >
        {t("card.jumpToSource", { page: card.anchor.page })} <Maximize2 size={13} />
      </button>
    </footer>
  )
}
