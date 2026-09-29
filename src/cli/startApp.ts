import { execFile } from "node:child_process"
import { connect } from "node:net"
import type { WebServerConfig } from "../server/config"
import { readOnboardingState, runOnboarding } from "./onboarding"
import { bold, dim, gray, link } from "./style"
import { appUrl } from "./tutorial"

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

export function openBrowser(url: string): void {
  if (process.platform === "darwin") execFile("open", [url], () => undefined)
  else if (process.platform === "win32") execFile("cmd", ["/c", "start", "", url], () => undefined)
  else execFile("xdg-open", [url], () => undefined)
}

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
  }
}
