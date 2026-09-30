import type { PointerEvent as ReactPointerEvent } from "react"
import type { Locale } from "../../shared/i18n/locale"
import type { DocumentId, Viewport } from "../../shared/schemas"
import { createPostIt } from "./board"

export function postItFromPointer(
  event: ReactPointerEvent<HTMLDivElement>,
  input: {
    readonly documentId: DocumentId
    readonly page: number
    readonly viewport: Viewport
    readonly viewportElement: HTMLDivElement | null
    readonly enabled: boolean
    /** The language the new note's title is written in. */
    readonly locale: Locale
  },
) {
  if (!input.enabled || event.button !== 0 || !(event.target instanceof HTMLElement)) return null
  if (event.target.closest("button, .board-card, .paper-structure-overlay")) return null
  if (!input.viewportElement) return null
  const bounds = input.viewportElement.getBoundingClientRect()
  return createPostIt(
    input.documentId,
    input.page,
    {
      x: (event.clientX - bounds.left - input.viewport.x) / input.viewport.zoom - 120,
      y: (event.clientY - bounds.top - input.viewport.y) / input.viewport.zoom - 24,
    },
    input.locale,
  )
}
