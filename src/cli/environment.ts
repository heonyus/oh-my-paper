import { spawn } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs"
import { access } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { findOnPath } from "../electron/executableLookup"
import { paddleInstallPaths, paddleInstallRunning } from "../electron/paddleInstallState"
import { PaddlePageParserService } from "../electron/paddlePageParserService"
import type { WebServerConfig } from "../server/config"

export type EnvironmentReport = {
  readonly codexRuntime: boolean
  readonly ocrReady: boolean
  /** A background install is still downloading or installing the OCR runtime. */
  readonly ocrInstalling: boolean
  readonly uvAvailable: boolean
  readonly nodeModules: boolean
}

const sourceRoot = fileURLToPath(new URL("../..", import.meta.url))

/** Whether the OCR engine is installed and ready to analyse pages. */
async function ocrEngineReady(): Promise<boolean> {
  const paddle = new PaddlePageParserService({
    appPath: sourceRoot,
    resourcesPath: sourceRoot,
    packaged: false,
  })
  try {
    return (await paddle.status()).configured
  } catch {
    return false
  } finally {
    paddle.dispose()
  }
}

export async function checkEnvironment(
  _config: WebServerConfig,
  codexAvailable: boolean,
): Promise<EnvironmentReport> {
  const ocrReady = await ocrEngineReady()

  let nodeModules = true
  try {
    await access(join(sourceRoot, "node_modules"))
  } catch {
    nodeModules = false
  }

  return {
    codexRuntime: codexAvailable,
    ocrReady,
    ocrInstalling: !ocrReady && paddleInstallRunning(homedir()),
    // The OCR install keeps its own uv beside the runtimes when the computer has none.
    uvAvailable:
      findOnPath("uv") !== null || existsSync(join(homedir(), ".ohmypaper", "tools", "uv", "uv")),
    nodeModules,
  }
}

/**
 * Starts the OCR runtime install detached from this terminal and returns its log path. The app
 * keeps working meanwhile and picks the engine up once the readiness marker appears.
 */
export function startOcrInstallInBackground(
  options: { readonly home?: string; readonly script?: string } = {},
): string {
  const script = options.script ?? join(sourceRoot, "scripts", "setup-paddle-vl-runtime.mjs")
  const { log, declined } = paddleInstallPaths(options.home ?? homedir())
  mkdirSync(dirname(log), { recursive: true })
  rmSync(declined, { force: true })
  const output = openSync(log, "w")
  try {
    spawn(process.execPath, [script], {
      detached: true,
      stdio: ["ignore", output, output],
      env: process.env,
    }).unref()
  } finally {
    closeSync(output)
  }
  return log
}

/** Remembers a "no" to the engine in the wizard, so updates and starts do not install it. */
export function recordOcrDeclined(home = homedir()): void {
  const { declined } = paddleInstallPaths(home)
  mkdirSync(dirname(declined), { recursive: true })
  writeFileSync(declined, `${new Date().toISOString()}\n`)
}

export type OcrInstallCheck = "ready" | "installing" | "started" | "declined"

/**
 * Starts the OCR engine install in the background when the engine is missing, as the wizard
 * would have: after an update, and when the app starts, so a computer that never got it (or
 * whose install stopped) gets it without asking again. A "no" in the wizard is kept.
 */
export async function ensureOcrInstall(
  options: {
    readonly home?: string
    readonly ready?: () => Promise<boolean>
    readonly start?: () => void
  } = {},
): Promise<OcrInstallCheck> {
  const home = options.home ?? homedir()
  if (await (options.ready ?? ocrEngineReady)()) return "ready"
  if (paddleInstallRunning(home)) return "installing"
  if (existsSync(paddleInstallPaths(home).declined)) return "declined"
  const start = options.start ?? (() => startOcrInstallInBackground({ home }))
  start()
  return "started"
}
