import type { JSX } from "react"
import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { Backdrop } from "../parts/Backdrop"
import { color, mono } from "../theme"

export function Outro(): JSX.Element {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const rise = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 120 } })
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Img
          src={staticFile("leaf.png")}
          style={{
            width: 112,
            height: 112,
            borderRadius: 28,
            opacity: rise(0),
            transform: `scale(${0.8 + 0.2 * rise(0)})`,
          }}
        />
        <div
          style={{
            marginTop: 28,
            fontSize: 84,
            fontWeight: 720,
            letterSpacing: "-0.04em",
            opacity: rise(6),
          }}
        >
          oh-my-paper
        </div>
        <div style={{ marginTop: 14, fontSize: 34, color: color.muted, opacity: rise(12) }}>
          논문을 읽는 자리에, 번역·설명·노트를.
        </div>
        <div
          style={{
            marginTop: 56,
            padding: "22px 34px",
            borderRadius: 18,
            background: color.terminal,
            color: "#edf2ec",
            fontFamily: mono,
            fontSize: 24,
            opacity: rise(20),
            transform: `translateY(${(1 - rise(20)) * 20}px)`,
            boxShadow: "0 30px 80px -30px rgba(15,21,18,0.6)",
          }}
        >
          <span style={{ color: "#9bccab" }}>$ </span>
          curl -fsSL …/oh-my-paper/main/scripts/install.sh | bash
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 26,
            color: color.action,
            fontWeight: 650,
            opacity: rise(28),
          }}
        >
          github.com/heonyus/oh-my-paper
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 36,
            fontSize: 17,
            color: color.muted,
            opacity: rise(34),
          }}
        >
          데모 논문: Wei et al., “Chain-of-Thought Prompting Elicits Reasoning in Large Language
          Models”, arXiv:2201.11903 · CC BY 4.0
        </div>
      </AbsoluteFill>
    </Backdrop>
  )
}
