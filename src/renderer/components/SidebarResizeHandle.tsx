import { type JSX, useRef } from "react"

function clamped(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function SidebarResizeHandle({
  label,
  width,
  minimum,
  maximum,
  edge,
  onWidthChange,
}: {
  readonly label: string
  readonly width: number
  readonly minimum: number
  readonly maximum: number
  readonly edge: "start" | "end"
  readonly onWidthChange: (width: number) => void
}): JSX.Element {
  const drag = useRef<{ readonly clientX: number; readonly width: number } | null>(null)
  const direction = edge === "end" ? 1 : -1
  return (
    <hr
      className="sidebar-resize-handle"
      data-edge={edge}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={(event) => {
        drag.current = { clientX: event.clientX, width }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const start = drag.current
        if (!start) return
        onWidthChange(
          clamped(start.width + (event.clientX - start.clientX) * direction, minimum, maximum),
        )
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        event.preventDefault()
        const delta = event.key === "ArrowRight" ? 16 : -16
        onWidthChange(clamped(width + delta, minimum, maximum))
      }}
    />
  )
}
