import { type JSX, useRef } from "react"
import { useTranslator } from "../lib/locale"
import { boardMessages } from "../messages/board"
import type { CardId } from "../types"

export function BoardCardResizeHandle({
  id,
  width,
  height,
  zoom,
  onResize,
  onResizeEnd,
}: {
  readonly id: CardId
  readonly width: number
  readonly height: number
  readonly zoom: number
  readonly onResize: (id: CardId, width: number, height: number) => void
  readonly onResizeEnd?: ((id: CardId, width: number, height: number) => void) | undefined
}): JSX.Element {
  const t = useTranslator(boardMessages)
  const start = useRef<{
    readonly clientX: number
    readonly clientY: number
    readonly width: number
    readonly height: number
  } | null>(null)
  const latest = useRef<{ readonly width: number; readonly height: number } | null>(null)
  return (
    <button
      type="button"
      className="card-resize-handle"
      aria-label={t("card.resize")}
      onPointerDown={(event) => {
        start.current = { clientX: event.clientX, clientY: event.clientY, width, height }
        latest.current = null
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const initial = start.current
        if (!initial) return
        const next = {
          width: Math.min(
            720,
            Math.max(240, initial.width + (event.clientX - initial.clientX) / zoom),
          ),
          height: Math.min(
            900,
            Math.max(160, initial.height + (event.clientY - initial.clientY) / zoom),
          ),
        }
        latest.current = next
        onResize(id, next.width, next.height)
      }}
      onPointerUp={() => {
        const size = latest.current
        start.current = null
        latest.current = null
        if (size) onResizeEnd?.(id, size.width, size.height)
      }}
      onPointerCancel={() => {
        start.current = null
        latest.current = null
      }}
    />
  )
}
