import { connect } from "node:net"
import type { WebServerConfig } from "../server/config"
import { ensureOcrInstall } from "./environment"
import { t } from "./messages"
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
    process.stdout.write(`${t("start.alreadyRunning", { url: link(url) })}\n`)
    if (openAfter) openBrowser(url)
    return
  }
  if (interactive) {
    try {
      const state = await readOnboardingState(config)
      if (!state.configured) {
        const outcome = await runOnboarding(config, { launchNext: true })
        if (!outcome.completed) process.stdout.write(gray(`${t("start.noAi")}\n`))
      }
    } catch (error) {
      process.stderr.write(
        `${t("start.skipCheck", { reason: error instanceof Error ? error.message : String(error) })}\n`,
      )
    }
  }
  await import("../server/main")
  if (await waitForPort(config.host, config.port, 30_000)) {
    process.stdout.write(
      `\n  ${bold("oh-my-paper")} ${dim(t("start.opened"))} → ${link(url)}   ${gray(t("start.quit"))}\n\n`,
    )
    if (openAfter) openBrowser(url)
    // After an update, or an install that stopped, the missing engine starts installing here.
    const ocr = await ensureOcrInstall().catch(() => null)
    if (ocr === "started") process.stdout.write(`  ${gray(t("start.ocrStarted"))}\n\n`)
  }
}
