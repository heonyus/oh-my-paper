import { Check, Copy, Languages, Trash2 } from "lucide-react"
import { type CSSProperties, type JSX, useState } from "react"
import { useTranslator } from "../lib/locale"
import { boardMessages } from "../messages/board"
import type { BoardCard } from "../types"
import { MarkdownContent } from "./MarkdownContent"

export type PeekPlacement = {
  readonly left: number
  readonly top: number
  readonly side: "above" | "below"
  /** Where the pointer entered the passage, measured from the peek's left edge. */
  readonly caret: number
}

/** A word's meanings arrive as a numbered list; they read better on one line. */
function wordMeanings(body: string): readonly string[] | null {
  const lines = body.trim().split("\n")
  const meanings = lines.map((line) => line.match(/^\s*\d+[.)]\s*(.+)$/u)?.[1])
  if (meanings.length === 0 || meanings.some((meaning) => !meaning)) return null
  return meanings.map((meaning) => (meaning ?? "").replace(/\*\*/gu, "").trim())
}

/**
 * The translation of a passage, shown just above or below it while the reader hovers it.
 * Unlike a card it has no place on the board; it goes away when the pointer leaves.
 */
export function TranslationPeek({
  card,
  placement,
  onPointerEnter,
  onPointerLeave,
  onDelete,
}: {
  readonly card: BoardCard
  readonly placement: PeekPlacement
  readonly onPointerEnter: () => void
  readonly onPointerLeave: () => void
  readonly onDelete: () => void
}): JSX.Element {
  const t = useTranslator(boardMessages)
  const [copied, setCopied] = useState(false)
  const meanings = card.loading ? null : wordMeanings(card.body)
  const style = {
    left: placement.left,
    top: placement.top,
    "--peek-caret": `${placement.caret}px`,
  } as CSSProperties

  async function copy(): Promise<void> {
    try {
      await window.ohmypaper.writeClipboardText(meanings ? meanings.join(", ") : card.body)
      setCopied(true)
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error
    }
  }

  return (
    <aside
      className="translation-peek"
      data-side={placement.side}
      style={style}
      aria-label={t("translation.label")}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header>
        <span className="translation-peek-label">
          <Languages size={12} aria-hidden="true" /> {t("translation.label")}
        </span>
        {card.loading ? null : (
          <span className="translation-peek-actions">
            <button
              type="button"
              aria-label={copied ? t("translation.copied") : t("translation.copy")}
              title={copied ? t("translation.copied") : t("translation.copy")}
              onClick={() => void copy()}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              type="button"
              aria-label={t("translation.delete")}
              title={t("translation.delete")}
              onClick={onDelete}
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </header>
      {card.loading ? (
        <p className="translation-peek-loading" role="status">
          {t("translation.loading")}
        </p>
      ) : meanings ? (
        <p className="translation-peek-meanings">
          {meanings.map((meaning) => (
            <span key={meaning}>{meaning}</span>
          ))}
        </p>
      ) : (
        <MarkdownContent className="translation-peek-body" source={card.body} />
      )}
    </aside>
  )
}
