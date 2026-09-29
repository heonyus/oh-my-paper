import type { JSX } from "react"
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { color } from "../theme"

export function Keycap({ label }: { readonly label: string }): JSX.Element {
  return (
    <span
      style={{
        display: "inline-grid",
        placeItems: "center",
        minWidth: 40,
        height: 40,
        padding: "0 10px",
        marginLeft: 8,
        borderRadius: 10,
        border: `1.5px solid ${color.line}`,
        borderBottomWidth: 4,
        background: color.surface,
        color: color.ink,
        fontFamily: "'SF Mono', Menlo, monospace",
        fontSize: 22,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  )
}

/** A floating pill that names what the viewer is watching. */
export function Caption({
  text,
  keys = [],
  durationInFrames,
}: {
  readonly text: string
  readonly keys?: readonly string[] | undefined
  readonly durationInFrames: number
}): JSX.Element {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 140 } })
  const exit = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 56,
        transform: `translate(-50%, ${(1 - enter) * 30}px)`,
        opacity: enter * exit,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "16px 28px",
        borderRadius: 999,
        background: "rgba(23, 37, 31, 0.92)",
        color: "#f4f5f2",
        fontSize: 32,
        fontWeight: 650,
        letterSpacing: "-0.02em",
        boxShadow: "0 24px 60px -20px rgba(23, 37, 31, 0.55)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
      {keys.map((key) => (
        <Keycap key={key} label={key} />
      ))}
    </div>
  )
}
