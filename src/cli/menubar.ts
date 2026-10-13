import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs"
import { homedir, userInfo } from "node:os"
import { dirname, join } from "node:path"
import { log } from "@clack/prompts"
import type { WebServerConfig } from "../server/config"
import { t } from "./messages"
import { waitForPort } from "./startApp"
import { gray, link } from "./style"
import { appUrl } from "./tutorial"

/** The agent's name in launchd; `menubar/main.swift` writes the same one into its plist. */
const LABEL = "com.honey.oh-my-paper.menubar"

type Ran = { readonly ok: boolean; readonly output: string }

/** What the command touches outside this process, so a test can stand in for macOS. */
export type MenubarSystem = {
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly uid: number
  readonly run: (command: string, args: readonly string[]) => Ran
  readonly waitForPort: (host: string, port: number, timeoutMs: number) => Promise<boolean>
  readonly pause: (ms: number) => Promise<void>
}

const macos: MenubarSystem = {
  platform: process.platform,
  home: homedir(),
  uid: userInfo().uid,
  run: (command, args) => {
    const result = spawnSync(command, args, { encoding: "utf8" })
    return {
      ok: result.status === 0,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    }
  },
  waitForPort,
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * `oh-my-paper menubar [off]`: hands the app to launchd behind a menu bar icon. Started from a
 * terminal the server stops with that terminal; started this way it runs until 종료 in the menu,
 * comes back if it dies, and starts again at login.
 */
export async function menubarCommand(
  config: WebServerConfig,
  appRoot: string,
  action?: string,
  system: MenubarSystem = macos,
): Promise<void> {
  const fail = (message: string, detail = ""): void => {
    process.stderr.write(`${message}${detail ? `\n${gray(detail)}` : ""}\n`)
    process.exitCode = 1
  }
  if (system.platform !== "darwin") return fail(t("menubar.macOnly"))
  const domain = `gui/${system.uid}`
  const plist = join(system.home, "Library", "LaunchAgents", `${LABEL}.plist`)
  if (action === "off") {
    system.run("launchctl", ["bootout", `${domain}/${LABEL}`])
    rmSync(plist, { force: true })
    log.success(t("menubar.off"))
    return
  }

  const source = join(appRoot, "menubar", "main.swift")
  const binary = join(appRoot, "menubar", "bin", "oh-my-paper-menubar")
  if (!existsSync(binary) || statSync(binary).mtimeMs < statSync(source).mtimeMs) {
    mkdirSync(dirname(binary), { recursive: true })
    const built = system.run("swiftc", ["-O", "-o", binary, source])
    if (!built.ok) return fail(t("menubar.buildFailed"), built.output)
  }
  const written = system.run(binary, [
    "--repo",
    appRoot,
    "--port",
    String(config.port),
    "--write-launch-agent",
  ])
  if (!written.ok) return fail(t("menubar.failed"), written.output)

  // An agent from an earlier run goes first, and launchd takes a moment to let go of it.
  system.run("launchctl", ["bootout", `${domain}/${LABEL}`])
  let started: Ran = { ok: false, output: "" }
  for (let attempt = 0; attempt < 20 && !started.ok; attempt += 1) {
    if (attempt > 0) await system.pause(250)
    started = system.run("launchctl", ["bootstrap", domain, plist])
  }
  if (!started.ok) return fail(t("menubar.failed"), started.output)

  const url = appUrl(config.host, config.port)
  if (await system.waitForPort(config.host, config.port, 30_000))
    log.success(`${t("menubar.on", { url: link(url) })}\n${gray(t("menubar.onHint"))}`)
  else
    log.warn(
      t("menubar.slow", {
        log: join(system.home, "Library", "Logs", "oh-my-paper", "menubar.log"),
      }),
    )
}
