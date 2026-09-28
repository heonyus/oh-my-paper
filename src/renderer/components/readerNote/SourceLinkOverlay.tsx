import type { Editor } from "@tiptap/react"
import { type JSX, useEffect, useRef } from "react"
import { spansCoveringPassage } from "../../lib/sourceQuoteFlash"
import type { SourceMatch } from "../../lib/useNoteCompanion"

const LINK_CLASS = "note-source-link"

function blockElement(editor: Editor, key: string): HTMLElement | null {
  let found: HTMLElement | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isTextblock) return !found
    if (node.textContent.trim() === key) {
      const dom = editor.view.nodeDOM(pos)
      if (dom instanceof HTMLElement) found = dom
    }
    return false
  })
  return found
}

function unionRect(elements: readonly HTMLElement[]): DOMRect | null {
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const element of elements) {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    left = Math.min(left, rect.left)
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  }
  return Number.isFinite(left) ? new DOMRect(left, top, right - left, bottom - top) : null
}

function visibleWithin(rect: DOMRect, bounds: DOMRect): boolean {
  return rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left
}

/**
 * Underlines, in the PDF, the passage the sentence being written rests on and draws a thin line
 * from that passage to the sentence. It only ever marks one passage, and only while it is live.
 */
export function SourceLinkOverlay({
  editor,
  match,
}: {
  readonly editor: Editor | null
  readonly match: SourceMatch | null
}): JSX.Element {
  const path = useRef<SVGPathElement>(null)

  useEffect(() => {
    const line = path.current
    if (!editor || !match || !line) return
    let frame = 0
    let marked: readonly HTMLElement[] = []
    const draw = (): void => {
      const pageSpans = [
        ...document.querySelectorAll<HTMLElement>(
          `.page[data-page-number="${match.source.page}"] .textLayer span`,
        ),
      ]
      const spans = spansCoveringPassage(pageSpans, match.source.text)
      if (spans.length !== marked.length || spans.some((span, index) => span !== marked[index])) {
        for (const span of marked) span.classList.remove(LINK_CLASS)
        for (const span of spans) span.classList.add(LINK_CLASS)
        marked = spans
      }
      const block = blockElement(editor, match.key)
      const source = unionRect(spans)
      const board = document.querySelector(".board-viewport")?.getBoundingClientRect()
      if (block && source && board && visibleWithin(source, board)) {
        const target = block.getBoundingClientRect()
        const startX = Math.min(source.right, board.right) + 4
        const startY = source.top + Math.min(source.height, 24) / 2
        const endX = target.left - 8
        const endY = target.top + 12
        const bend = Math.max(40, (endX - startX) / 2)
        line.setAttribute(
          "d",
          `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
        )
        line.style.visibility = "visible"
      } else {
        line.style.visibility = "hidden"
      }
      frame = window.requestAnimationFrame(draw)
    }
    frame = window.requestAnimationFrame(draw)
    return () => {
      window.cancelAnimationFrame(frame)
      for (const span of marked) span.classList.remove(LINK_CLASS)
      line.style.visibility = "hidden"
    }
  }, [editor, match])

  return (
    <svg className="note-link-overlay" aria-hidden="true">
      <path ref={path} style={{ visibility: "hidden" }} />
    </svg>
  )
}
