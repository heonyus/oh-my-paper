import { spawnSync } from "node:child_process"
import { access } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { findOnPath } from "../electron/executableLookup"
import { PaddlePageParserService } from "../electron/paddlePageParserService"
import type { WebServerConfig } from "../server/config"

export type EnvironmentReport = {
  readonly codexRuntime: boolean
  readonly ocrReady: boolean
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
    uvAvailable: findOnPath("uv") !== null,
    nodeModules,
  }
}

export function installOcrRuntime(): boolean {
  const script = join(sourceRoot, "scripts", "setup-paddle-vl-runtime.mjs")
  const result = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    env: process.env,
  })
  return result.status === 0
}
