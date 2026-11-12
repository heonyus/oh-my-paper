import { type JSX, useMemo, useRef, useState } from "react"
import { infographicDocument } from "../lib/infographicHtml"

/**
 * A wheel inside the frame goes to the frame's own document and never reaches the board, so a
 * pan stopped dead on an infographic. The frame is as tall as its content and has nothing to
 * scroll, so each wheel is handed to the page as if it had landed on the frame: the board pans
 * or zooms with it, or leaves it to the card, whose text is then scrolled here.
 */
export function forwardWheel(frame: HTMLIFrameElement, event: WheelEvent): void {
  event.preventDefault()
  const rect = frame.getBoundingClientRect()
  // The board draws the frame scaled by its zoom.
  const scaleX = frame.clientWidth > 0 ? rect.width / frame.clientWidth : 1
  const scaleY = frame.clientHeight > 0 ? rect.height / frame.clientHeight : 1
  const forwarded = new WheelEvent("wheel", {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    clientX: rect.left + event.clientX * scaleX,
    clientY: rect.top + event.clientY * scaleY,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    bubbles: true,
    cancelable: true,
  })
  if (!frame.dispatchEvent(forwarded)) return
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1
  frame
    .closest(".card-body")
    ?.scrollBy({ left: event.deltaX * unit, top: event.deltaY * unit, behavior: "instant" })
}

/**
 * Draws a model-written HTML fragment in a frame that runs no scripts and loads nothing from the
 * network. Same-origin is allowed only so the card can size the frame to its content; without
 * allow-scripts the fragment itself still cannot reach the app.
 */
export function InfographicFrame({
  html,
  title,
}: {
  readonly html: string
  readonly title: string
}): JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(240)
  const srcDoc = useMemo(
    () => infographicDocument(html, getComputedStyle(document.documentElement)),
    [html],
  )
  return (
    <iframe
      ref={frame}
      className="card-infographic"
      title={title}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      style={{ height }}
      onLoad={() => {
        const element = frame.current
        const content = element?.contentDocument
        if (!element || !content) return
        setHeight(Math.max(120, content.documentElement.scrollHeight))
        // A fresh document on every load, so the listener is never added twice.
        content.addEventListener("wheel", (event) => forwardWheel(element, event), {
          passive: false,
        })
      }}
    />
  )
}
