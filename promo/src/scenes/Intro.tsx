import type { JSX } from "react"
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"
import { Backdrop } from "../parts/Backdrop"
import { color } from "../theme"

export function Intro(): JSX.Element {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const rise = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 120 } })
  const marker = interpolate(frame, [34, 58], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  return (
    <Backdrop>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 220px", opacity: out }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            opacity: rise(0),
            transform: `translateY(${(1 - rise(0)) * 20}px)`,
          }}
        >
          <Img src={staticFile("leaf.png")} style={{ width: 64, height: 64, borderRadius: 16 }} />
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>
            oh-my-paper
          </span>
        </div>
        <h1
          style={{
            margin: "56px 0 0",
            fontSize: 112,
            fontWeight: 720,
            lineHeight: 1.12,
            letterSpacing: "-0.04em",
            opacity: rise(8),
            transform: `translateY(${(1 - rise(8)) * 30}px)`,
          }}
        >
          PDF는 그대로,
          <br />
          번역·설명·노트는{" "}
          <span
            style={{
              color: color.action,
              backgroundImage: `linear-gradient(${color.marker}, ${color.marker})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "0 88%",
              backgroundSize: `${marker}% 34%`,
            }}
          >
            원문 자리에.
          </span>
        </h1>
        <p
          style={{
            marginTop: 40,
            fontSize: 36,
            color: color.muted,
            opacity: rise(22),
            letterSpacing: "-0.01em",
          }}
        >
          문장을 고르고 한 키로. 문서는 이 Mac 밖으로 나가지 않습니다.
        </p>
      </AbsoluteFill>
    </Backdrop>
  )
}
