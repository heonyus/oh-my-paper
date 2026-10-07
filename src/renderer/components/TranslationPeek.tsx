import { Check, Copy, Trash2 } from "lucide-react"
import { type CSSProperties, type JSX, useLayoutEffect, useRef, useState } from "react"
import { useTranslator } from "../lib/locale"
import { boardMessages } from "../messages/board"
import type { BoardCard } from "../types"
import { MarkdownContent } from "./MarkdownContent"

/** The passage the peek belongs to, in the board viewport's content coordinates. */
export type PeekAnchor = {
  /** Where the peek's caret points: the hovered word's middle, or the pointer on a long line. */
  readonly x: number
  readonly top: number
  readonly bottom: number
}

/** The part of the viewport's content the peek must stay inside. */
export type PeekBounds = {
  readonly left: number
  readonly right: number
  readonly top: number
}

type Placement = {
  readonly left: number
  readonly top: number
  readonly side: "above" | "below"
  readonly caret: number
}

/** Room between the passage and the peek; the caret fills most of it. */
const GAP = 7
const CARET_INSET = 12

/** A word's meanings arrive as a numbered list; they read better on one line. */
function wordMeanings(body: string): readonly string[] | null {
  const lines = body.trim().split("\n")
  const meanings = lines.map((line) => line.match(/^\s*\d+[.)]\s*(.+)$/u)?.[1])
  if (meanings.length === 0 || meanings.some((meaning) => !meaning)) return null
  return meanings.map((meaning) => (meaning ?? "").replace(/\*\*/gu, "").trim())
}

/** Centred on the anchor, just above the line, or below it when there is no room above. */
export function placePeek(anchor: PeekAnchor, bounds: PeekBounds, width: number, height: number) {
  const left = Math.max(
    bounds.left,
    Math.min(anchor.x - width / 2, Math.max(bounds.left, bounds.right - width)),
  )
  const above = anchor.top - GAP - height >= bounds.top
  return {
    left,
    top: above ? anchor.top - GAP - height : anchor.bottom + GAP,
    side: above ? "above" : "below",
    caret: Math.max(CARET_INSET, Math.min(anchor.x - left, width - CARET_INSET)),
  } satisfies Placement
}

/**
 * The translation of a passage, shown just above or below it while the reader hovers it.
 * Unlike a card it has no place on the board; it goes away when the pointer leaves.
 */
export function TranslationPeek({
  card,
  anchor,
  bounds,
  onPointerEnter,
  onPointerLeave,
  onDelete,
}: {
  readonly card: BoardCard
  readonly anchor: PeekAnchor
  readonly bounds: PeekBounds
  readonly onPointerEnter: () => void
  readonly onPointerLeave: () => void
  readonly onDelete: () => void
}): JSX.Element {
  const t = useTranslator(boardMessages)
  const ref = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const meanings = card.loading ? null : wordMeanings(card.body)

  // Placed from its rendered size, so it sits right over the passage whatever its length, and
  // placed again when its text arrives or changes.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const place = (): void =>
      setPlacement(placePeek(anchor, bounds, element.offsetWidth, element.offsetHeight))
    place()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(place)
    observer.observe(element)
    return () => observer.disconnect()
  }, [anchor, bounds])

  async function copy(): Promise<void> {
    try {
      await window.ohmypaper.writeClipboardText(meanings ? meanings.join(", ") : card.body)
      setCopied(true)
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error
    }
  }

  const style = {
    left: placement?.left ?? 0,
    top: placement?.top ?? 0,
    visibility: placement ? undefined : "hidden",
    "--peek-caret": `${placement?.caret ?? 0}px`,
  } as CSSProperties

  return (
    <aside
      ref={ref}
      className="translation-peek"
      data-side={placement?.side}
      data-kind={meanings ? "word" : "passage"}
      style={style}
      aria-label={t("translation.label")}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={(event) => event.stopPropagation()}
    >
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
      {card.loading ? null : (
        <span className="translation-peek-actions">
          <button
            type="button"
            aria-label={copied ? t("translation.copied") : t("translation.copy")}
            title={copied ? t("translation.copied") : t("translation.copy")}
            onClick={() => void copy()}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            type="button"
            aria-label={t("translation.delete")}
            title={t("translation.delete")}
            onClick={onDelete}
          >
            <Trash2 size={12} />
          </button>
        </span>
      )}
    </aside>
  )
}
