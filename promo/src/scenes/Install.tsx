import type { JSX } from "react"
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { Backdrop } from "../parts/Backdrop"
import { Caption } from "../parts/Caption"
import { color, mono } from "../theme"

const COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.sh | bash"
const WORDMARK = [
  "┌─┐┬ ┬   ┌┬┐┬ ┬   ┌─┐┌─┐┌─┐┌─┐┬─┐",
  "│ │├─┤───│││└┬┘───├─┘├─┤├─┘├┤ ├┬┘",
  "└─┘┴ ┴   ┴ ┴ ┴    ┴  ┴ ┴┴  └─┘┴└─",
]
const ROW_COLORS = ["#7fd1a0", "#b7ca73", "#efc245"]

type Line = {
  readonly at: number
  readonly text: string
  readonly tone?: "ok" | "step" | "dim" | "pick"
}

/** Mirrors the real installer and wizard output (scripts/install.sh, src/cli/onboarding.ts). */
const INSTALL: readonly Line[] = [
  { at: 52, text: "◆  1/4  시스템 확인", tone: "step" },
  { at: 58, text: "│  ✔ macOS · Apple Silicon", tone: "ok" },
  { at: 62, text: "│  ✔ Node.js v22", tone: "ok" },
  { at: 68, text: "◆  2/4  내려받기", tone: "step" },
  { at: 76, text: "│  ✔ 저장소 복제", tone: "ok" },
  { at: 82, text: "◆  3/4  설치와 빌드", tone: "step" },
  { at: 96, text: "│  ✔ 의존성 설치", tone: "ok" },
  { at: 106, text: "│  ✔ 웹 앱 빌드", tone: "ok" },
  { at: 112, text: "◆  4/4  명령어 연결", tone: "step" },
  { at: 116, text: "│  ✔ ~/.local/bin/oh-my-paper", tone: "ok" },
  { at: 122, text: "└  설치 완료", tone: "ok" },
]

const WIZARD: readonly Line[] = [
  { at: 134, text: "◆  2/4  OCR 엔진 (선택)", tone: "step" },
  { at: 136, text: "│  ✔ 백그라운드에서 받는 중 — AI를 연결하는 동안 받아 둡니다", tone: "ok" },
  { at: 140, text: "◆  3/4  AI 연결", tone: "step" },
  {
    at: 142,
    text: "│  번역·설명·노트 튜터가 쓸 AI입니다. 구독이 있으면 API 키 없이 바로 됩니다.",
    tone: "dim",
  },
  { at: 148, text: "◆  어떻게 연결할까요?", tone: "step" },
  {
    at: 150,
    text: "│  ● ChatGPT 구독 (OpenAI)   ChatGPT 계정 로그인 · API 키 불필요 · GPT-6 Luna",
    tone: "pick",
  },
  { at: 150, text: "│  ○ Claude 구독 (Anthropic)" },
  { at: 150, text: "│  ○ API 키" },
  { at: 186, text: "│  ✔ 연결된 계정 · 브라우저 로그인 완료", tone: "ok" },
  { at: 196, text: "│  ✔ ChatGPT 구독 연결 완료 · gpt-6-luna · 추론 medium", tone: "ok" },
  { at: 206, text: "◆  4/4  사용법 — T 번역  E 설명  C 노트에  H 하이라이트", tone: "step" },
]

function toneColor(tone: Line["tone"]): string {
  if (tone === "ok") return "#9bccab"
  if (tone === "step") return "#edf2ec"
  if (tone === "pick") return "#efc245"
  return "#8a988e"
}

export function Install(): JSX.Element {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 110 } })
  const typed = Math.floor(
    interpolate(frame, [6, 40], [0, COMMAND.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  )
  const wizard = frame >= 134
  const lines = (wizard ? WIZARD : INSTALL).filter((line) => frame >= line.at)
  const bannerOn = !wizard && frame >= 44
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 1500,
            height: 820,
            borderRadius: 20,
            overflow: "hidden",
            background: color.terminal,
            boxShadow: "0 60px 140px -50px rgba(15,21,18,0.7)",
            transform: `translateY(${(1 - enter) * 40}px) scale(${0.96 + 0.04 * enter})`,
            opacity: enter,
            fontFamily: mono,
          }}
        >
          <div
            style={{
              height: 48,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 20px",
              background: "#1a221e",
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
            <span style={{ margin: "0 auto", color: "#8a988e", fontSize: 16 }}>Terminal — zsh</span>
          </div>
          <div
            style={{
              padding: "28px 36px",
              fontSize: 22,
              lineHeight: 1.55,
              color: "#edf2ec",
              whiteSpace: "pre",
            }}
          >
            {!wizard ? (
              <div>
                <span style={{ color: "#9bccab" }}>~ </span>
                {COMMAND.slice(0, typed)}
                {typed < COMMAND.length || frame % 30 < 15 ? (
                  <span style={{ background: "#edf2ec", color: color.terminal }}> </span>
                ) : null}
              </div>
            ) : (
              <div>
                <span style={{ color: "#9bccab" }}>~ </span>oh-my-paper onboard
              </div>
            )}
            {bannerOn || wizard ? (
              <div style={{ margin: "18px 0 14px" }}>
                {WORDMARK.map((row, index) => (
                  <div
                    key={row}
                    style={{ color: ROW_COLORS[index], fontSize: 26, lineHeight: 1.15 }}
                  >
                    {"  "}
                    {row}
                  </div>
                ))}
              </div>
            ) : null}
            {lines.map((line) => (
              <div
                key={`${line.at}-${line.text}`}
                style={{
                  color: toneColor(line.tone),
                  fontWeight: line.tone === "step" ? 700 : 400,
                }}
              >
                {line.text}
              </div>
            ))}
          </div>
        </div>
        <Caption
          text={wizard ? "ChatGPT·Claude 구독으로 바로 연결" : "터미널 한 줄로 설치"}
          durationInFrames={durationInFrames}
        />
      </AbsoluteFill>
    </Backdrop>
  )
}
