import { homedir } from "node:os"
import { bold, dim, gray, key, link, padEnd } from "./style"

export function appUrl(host: string, port: number): string {
  return `http://${host}:${port}`
}

/** The short tour shown at the end of onboarding and by `oh-my-paper help`. */
export function quickstart(url: string, dataDir: string): string {
  const row = (label: string, text: string): string => `${padEnd(bold(label), 10)}${text}`
  return [
    row("시작", `${bold("oh-my-paper")}  → ${link(url)} 이 열립니다`),
    row("가져오기", "PDF를 라이브러리에 끌어다 놓으면 페이지 구조를 먼저 분석합니다"),
    row("읽기", "문장을 드래그한 뒤 한 키로:"),
    `${" ".repeat(10)}${key("T")} 번역  ${key("E")} 설명  ${key("C")} 노트에  ${key("H")} 하이라이트`,
    row("노트", "툴바의 노트 — 내 말로 쓰면 근거가 된 문단을 옆에 보여줍니다"),
    "",
    row("데이터", `${dataDir.replace(homedir(), "~")} ${gray("(PDF·노트·캐시 모두 이 Mac에만)")}`),
    row("명령어", `oh-my-paper ${dim("start · onboard · doctor · update · help")}`),
  ].join("\n")
}
