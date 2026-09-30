import { spawn } from "node:child_process"
import { closeSync, mkdirSync, openSync } from "node:fs"
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

export async function checkEnvironment(
  _config: WebServerConfig,
  codexAvailable: boolean,
): Promise<EnvironmentReport> {
  const paddle = new PaddlePageParserService({
    appPath: sourceRoot,
    resourcesPath: sourceRoot,
    packaged: false,
  })
  let ocrReady = false
  try {
    ocrReady = (await paddle.status()).configured
  } catch {
    ocrReady = false
  } finally {
    paddle.dispose()
  }

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
    uvAvailable: findOnPath("uv") !== null,
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
  const { log } = paddleInstallPaths(options.home ?? homedir())
  mkdirSync(dirname(log), { recursive: true })
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
