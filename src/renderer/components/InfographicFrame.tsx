import { type JSX, useMemo, useRef, useState } from "react"
import { infographicDocument } from "../lib/infographicHtml"

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
        const body = frame.current?.contentDocument?.documentElement
        if (body) setHeight(Math.max(120, body.scrollHeight))
      }}
    />
  )
}
