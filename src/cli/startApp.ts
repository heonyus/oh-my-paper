import { connect } from "node:net"
import type { WebServerConfig } from "../server/config"
import { ensureOcrInstall } from "./environment"
import { readOnboardingState, runOnboarding } from "./onboarding"
import { openBrowser } from "./openBrowser"
import { bold, dim, gray, link } from "./style"
import { appUrl } from "./tutorial"

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

export function portOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    socket.once("connect", () => {
      socket.end()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(host, port)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

/** Runs onboarding when nothing is connected yet, then serves the app and opens the browser. */
export async function startApp(config: WebServerConfig, openAfter: boolean): Promise<void> {
  const url = appUrl(config.host, config.port)
  if (await portOpen(config.host, config.port)) {
    process.stdout.write(`oh-my-paper가 이미 실행 중입니다 → ${link(url)}\n`)
    if (openAfter) openBrowser(url)
    return
  }
  if (interactive) {
    try {
      const state = await readOnboardingState(config)
      if (!state.configured) {
        const outcome = await runOnboarding(config, { launchNext: true })
        if (!outcome.completed)
          process.stdout.write(gray("AI 연결 없이 시작합니다 — 앱에서 연결할 수 있습니다\n"))
      }
    } catch (error) {
      process.stderr.write(
        `설정 확인을 건너뜁니다: ${error instanceof Error ? error.message : String(error)}\n`,
      )
    }
  }
  await import("../server/main")
  if (await waitForPort(config.host, config.port, 30_000)) {
    process.stdout.write(
      `\n  ${bold("oh-my-paper")} ${dim("열림")} → ${link(url)}   ${gray("종료: Ctrl+C")}\n\n`,
    )
    if (openAfter) openBrowser(url)
    // After an update, or an install that stopped, the missing engine starts installing here.
    const ocr = await ensureOcrInstall().catch(() => null)
    if (ocr === "started")
      process.stdout.write(
        `  ${gray("문서 분석 엔진(OCR)이 없어서 뒤에서 설치를 시작했어요 — 준비되면 알아서 켜집니다")}\n\n`,
      )
  }
}
