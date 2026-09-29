import type { CSSProperties, JSX, ReactNode } from "react"
import { color } from "../theme"

export const TITLE_BAR = 52

/** A quiet macOS browser frame around the recording. */
export function BrowserWindow({
  width,
  height,
  url,
  children,
  style,
}: {
  readonly width: number
  readonly height: number
  readonly url: string
  readonly children: ReactNode
  readonly style?: CSSProperties
}): JSX.Element {
  return (
    <div
      style={{
        position: "absolute",
        width,
        height: height + TITLE_BAR,
        borderRadius: 18,
        overflow: "hidden",
        background: color.surface,
        border: "1px solid rgba(23, 37, 31, 0.12)",
        boxShadow:
          "0 2px 6px rgba(23,37,31,0.06), 0 50px 120px -40px rgba(23,37,31,0.45), 0 30px 60px -30px rgba(23,37,31,0.25)",
        ...style,
      }}
    >
      <div
        style={{
          height: TITLE_BAR,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 20px",
          background: "#eceee9",
          borderBottom: "1px solid rgba(23, 37, 31, 0.08)",
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((dot) => (
          <i
            key={dot}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: dot,
              display: "block",
            }}
          />
        ))}
        <div
          style={{
            margin: "0 auto",
            width: "38%",
            height: 30,
            borderRadius: 8,
            background: "rgba(255,255,255,0.85)",
            display: "grid",
            placeItems: "center",
            fontSize: 15,
            color: color.muted,
          }}
        >
          {url}
        </div>
        <span style={{ width: 62 }} />
      </div>
      <div style={{ position: "relative", width, height, overflow: "hidden" }}>{children}</div>
    </div>
  )
}
