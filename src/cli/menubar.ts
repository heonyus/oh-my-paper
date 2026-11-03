import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { homedir, userInfo } from "node:os"
import { dirname, join, win32 } from "node:path"
import { log } from "@clack/prompts"
import type { WebServerConfig } from "../server/config"
import { t } from "./messages"
import { waitForPort } from "./startApp"
import { gray, link } from "./style"
import { appUrl } from "./tutorial"

/** The agent's name in launchd; `menubar/main.swift` writes the same one into its plist. */
const LABEL = "com.honey.oh-my-paper.menubar"

/** The Windows companion's program; `menubar/windows/OhMyPaperTray.cs` is its source. */
const TRAY = "oh-my-paper-tray.exe"

/** Where Windows starts per-user programs at sign-in; the companion writes its value there. */
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
const RUN_VALUE = "oh-my-paper"

type Ran = { readonly ok: boolean; readonly output: string }

/** What the command touches outside this process, so a test can stand in for macOS or Windows. */
export type MenubarSystem = {
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly uid: number
  readonly run: (command: string, args: readonly string[]) => Ran
  readonly waitForPort: (host: string, port: number, timeoutMs: number) => Promise<boolean>
  readonly pause: (ms: number) => Promise<void>
  /** Starts a program that outlives this one: the Windows companion. */
  readonly launch?: (command: string, args: readonly string[]) => boolean
  /** The C# compiler of the .NET Framework that ships with Windows, or null. */
  readonly compiler?: () => string | null
  /** The node that runs this CLI, which the Windows companion runs the server with. */
  readonly node?: string
  /** %LOCALAPPDATA%, where the Windows companion keeps its log. */
  readonly localAppData?: string
}

/** csc.exe of .NET Framework 4, present on every Windows 10 and 11 (64-bit folder first). */
export function findCsharpCompiler(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const windows = env["SystemRoot"] ?? env["WINDIR"] ?? "C:\\Windows"
  for (const framework of ["Framework64", "Framework"]) {
    const candidate = win32.join(windows, "Microsoft.NET", framework, "v4.0.30319", "csc.exe")
    if (exists(candidate)) return candidate
  }
  return null
}

const system: MenubarSystem = {
  platform: process.platform,
  home: homedir(),
  uid: process.platform === "win32" ? 0 : userInfo().uid,
  run: (command, args) => {
    const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true })
    return {
      ok: result.status === 0,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    }
  },
  waitForPort,
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  launch: (command, args) => {
    try {
      spawn(command, args, { detached: true, stdio: "ignore" })
        .once("error", () => undefined)
        .unref()
      return true
    } catch {
      return false
    }
  },
  compiler: () => findCsharpCompiler(),
  node: process.execPath,
  localAppData: process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local"),
}

/** Whether `binary` is missing or older than `source`, so it needs building again. */
function stale(binary: string, source: string): boolean {
  return !existsSync(binary) || statSync(binary).mtimeMs < statSync(source).mtimeMs
}

/**
 * `oh-my-paper menubar [off]`: hands the app to launchd behind a menu bar icon on macOS, and to
 * a notification-area companion started at sign-in on Windows. Started from a terminal the
 * server stops with that terminal; started this way it runs until 종료 in the menu, comes back
 * if it dies, and starts again at login.
 */
export async function menubarCommand(
  config: WebServerConfig,
  appRoot: string,
  action?: string,
  host: MenubarSystem = system,
): Promise<void> {
  if (host.platform === "win32") return trayCommand(config, appRoot, action, host)
  if (host.platform !== "darwin") return fail(t("menubar.unsupported"))
  const domain = `gui/${host.uid}`
  const plist = join(host.home, "Library", "LaunchAgents", `${LABEL}.plist`)
  if (action === "off") {
    host.run("launchctl", ["bootout", `${domain}/${LABEL}`])
    rmSync(plist, { force: true })
    log.success(t("menubar.off"))
    return
  }

  const source = join(appRoot, "menubar", "main.swift")
  const binary = join(appRoot, "menubar", "bin", "oh-my-paper-menubar")
  if (stale(binary, source)) {
    mkdirSync(dirname(binary), { recursive: true })
    const built = host.run("swiftc", ["-O", "-o", binary, source])
    if (!built.ok) return fail(t("menubar.buildFailed"), built.output)
  }
  const written = host.run(binary, [
    "--repo",
    appRoot,
    "--port",
    String(config.port),
    "--write-launch-agent",
  ])
  if (!written.ok) return fail(t("menubar.failed"), written.output)

  // An agent from an earlier run goes first, and launchd takes a moment to let go of it.
  host.run("launchctl", ["bootout", `${domain}/${LABEL}`])
  let started: Ran = { ok: false, output: "" }
  for (let attempt = 0; attempt < 20 && !started.ok; attempt += 1) {
    if (attempt > 0) await host.pause(250)
    started = host.run("launchctl", ["bootstrap", domain, plist])
  }
  if (!started.ok) return fail(t("menubar.failed"), started.output)

  const url = appUrl(config.host, config.port)
  if (await host.waitForPort(config.host, config.port, 30_000))
    log.success(`${t("menubar.on", { url: link(url) })}\n${gray(t("menubar.onHint"))}`)
  else
    log.warn(
      t("menubar.slow", {
        log: join(host.home, "Library", "Logs", "oh-my-paper", "menubar.log"),
      }),
    )
}

function fail(message: string, detail = ""): void {
  process.stderr.write(`${message}${detail ? `\n${gray(detail)}` : ""}\n`)
  process.exitCode = 1
}

/**
 * The Windows side: builds the companion with csc.exe when its source is newer, stops one that
 * runs (with the server it started), records the sign-in start through the companion itself (as
 * the macOS one writes its agent) and starts it detached from this terminal.
 */
async function trayCommand(
  config: WebServerConfig,
  appRoot: string,
  action: string | undefined,
  host: MenubarSystem,
): Promise<void> {
  // /T takes the server the companion started along; Windows has no signal it could act on.
  const stopRunning = (): Ran => host.run("taskkill", ["/IM", TRAY, "/T", "/F"])
  if (action === "off") {
    stopRunning()
    host.run("reg", ["delete", RUN_KEY, "/v", RUN_VALUE, "/f"])
    log.success(t("tray.off"))
    return
  }

  const source = join(appRoot, "menubar", "windows", "OhMyPaperTray.cs")
  const binary = join(appRoot, "menubar", "bin", TRAY)
  const fresh = join(appRoot, "menubar", "bin", "oh-my-paper-tray.new.exe")
  const rebuild = stale(binary, source)
  if (rebuild) {
    const compiler = host.compiler?.() ?? null
    if (compiler === null) return fail(t("tray.noCompiler"))
    mkdirSync(dirname(binary), { recursive: true })
    const built = host.run(compiler, [
      "/nologo",
      "/target:winexe",
      "/optimize+",
      // The source is UTF-8 (its Korean labels); this compiler reads the ANSI code page otherwise.
      "/codepage:65001",
      `/out:${fresh}`,
      "/reference:System.Windows.Forms.dll",
      "/reference:System.Drawing.dll",
      source,
    ])
    if (!built.ok) return fail(t("tray.buildFailed"), built.output)
  }

  // A companion from an earlier run goes first, and Windows takes a moment to let go of its file.
  stopRunning()
  if (rebuild) {
    let replaced = false
    for (let attempt = 0; attempt < 20 && !replaced; attempt += 1) {
      if (attempt > 0) await host.pause(250)
      try {
        rmSync(binary, { force: true })
        renameSync(fresh, binary)
        replaced = true
      } catch {
        replaced = false
      }
    }
    if (!replaced) return fail(t("tray.failed"), binary)
  }

  const options = ["--repo", appRoot, "--port", String(config.port)]
  if (host.node) options.push("--node", host.node)
  const written = host.run(binary, [...options, "--write-login-item"])
  if (!written.ok) return fail(t("tray.failed"), written.output)
  if (!(host.launch?.(binary, options) ?? false)) return fail(t("tray.failed"), binary)

  const url = appUrl(config.host, config.port)
  if (await host.waitForPort(config.host, config.port, 30_000))
    log.success(`${t("tray.on", { url: link(url) })}\n${gray(t("tray.onHint"))}`)
  else {
    const appData = host.localAppData ?? join(host.home, "AppData", "Local")
    log.warn(t("tray.slow", { log: join(appData, "oh-my-paper", "Logs", "tray.log") }))
  }
}
