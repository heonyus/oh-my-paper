import type { JSX } from "react"
import type { RecordedEvent } from "../timeline"
import { cursorAt } from "./camera"

/** A macOS-style arrow with click ripples, drawn in viewport pixels. */
export function Cursor({
  events,
  t,
}: {
  readonly events: readonly RecordedEvent[]
  readonly t: number
}): JSX.Element | null {
  const point = cursorAt(events, t)
  if (!point) return null
  const ripples = events.filter(
    (event) => event.type === "down" && t >= event.t && t - event.t < 0.5,
  )
  const pressed = events.some(
    (event) => event.type === "down" && t >= event.t && t - event.t < 0.12,
  )
  return (
    <>
      {ripples.map((event) => {
        const k = (t - event.t) / 0.5
        return (
          <div
            key={event.t}
            style={{
              position: "absolute",
              left: (event.x ?? 0) - 6 - 22 * k,
              top: (event.y ?? 0) - 6 - 22 * k,
              width: 12 + 44 * k,
              height: 12 + 44 * k,
              borderRadius: "50%",
              border: `2.5px solid rgba(40, 86, 68, ${0.7 * (1 - k)})`,
              background: `rgba(127, 209, 160, ${0.25 * (1 - k)})`,
            }}
          />
        )
      })}
      <svg
        width={26}
        height={30}
        viewBox="0 0 26 30"
        style={{
          position: "absolute",
          left: point.x - 3,
          top: point.y - 2,
          transform: `scale(${pressed ? 0.88 : 1})`,
          transformOrigin: "3px 2px",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
        }}
        aria-hidden="true"
      >
        <path
          d="M3 2 L3 24 L9 18.5 L13 27.5 L17 25.8 L13 17 L21 17 Z"
          fill="#111"
          stroke="#fff"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
    </>
  )
}
