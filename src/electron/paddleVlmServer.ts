import { type ChildProcess, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { access } from "node:fs/promises"
import { createConnection, createServer } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"
import { buildOfflineSubprocessEnv } from "./offlineSubprocessEnvironment"

export type PaddleVlmConnection = {
  readonly serverUrl: string
  readonly model: string
  readonly apiKey: string
}

export interface PaddleVlmServer {
  start(): Promise<PaddleVlmConnection | null>
  stop(): void
}

export type ApplePaddleVlmServerOptions = {
  readonly home?: string
  readonly platform?: NodeJS.Platform
  readonly arch?: string
  readonly python?: string | undefined
  readonly readinessMarker?: string | undefined
  readonly modelDirectory?: string | undefined
}

class PaddleVlmLaunchError extends Error {
  readonly name = "PaddleVlmLaunchError"

  constructor(readonly reason: "port" | "process" | "timeout") {
    super(`Paddle MLX-VLM server failed: ${reason}`)
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function runtimeRoot(home: string): string {
  return join(home, ".ohmypaper", "paddle-vl-mlx-runtime")
}

export function paddleVlmRuntimePython(home: string): string {
  return join(runtimeRoot(home), "bin", "python")
}

export function paddleVlmModelDirectory(home: string): string {
  return join(runtimeRoot(home), "models", "PaddleOCR-VL-1.6")
}

export function paddleVlmServerEnvironment(home: string, apiKey: string): NodeJS.ProcessEnv {
  return buildOfflineSubprocessEnv({
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_HOME: join(home, ".cache", "huggingface"),
    NO_PROXY: "127.0.0.1,localhost",
    MLX_VLM_SERVER_API_KEY: apiKey,
  })
}

async function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        reject(new PaddleVlmLaunchError("port"))
        return
      }
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

function loopbackReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port })
    const finish = (ready: boolean): void => {
      socket.destroy()
      resolve(ready)
    }
    socket.setTimeout(250)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
  })
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitUntilReady(process: ChildProcess, port: number): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new PaddleVlmLaunchError("process")
    if (await loopbackReady(port)) return
    await pause(100)
  }
  throw new PaddleVlmLaunchError("timeout")
}

export class ApplePaddleVlmServer implements PaddleVlmServer {
  readonly #options: ApplePaddleVlmServerOptions
  #process: ChildProcess | null = null
  #connection: PaddleVlmConnection | null = null
  #starting: Promise<PaddleVlmConnection | null> | null = null

  constructor(options: ApplePaddleVlmServerOptions = {}) {
    this.#options = options
  }

  start(): Promise<PaddleVlmConnection | null> {
    if ((this.#options.platform ?? process.platform) !== "darwin") return Promise.resolve(null)
    if ((this.#options.arch ?? process.arch) !== "arm64") return Promise.resolve(null)
    if (this.#process?.exitCode === null && this.#connection)
      return Promise.resolve(this.#connection)
    if (this.#starting) return this.#starting
    this.#starting = this.#launch().finally(() => {
      this.#starting = null
    })
    return this.#starting
  }

  stop(): void {
    this.#connection = null
    this.#starting = null
    this.#process?.kill()
    this.#process = null
  }

  async #launch(): Promise<PaddleVlmConnection | null> {
    const home = this.#options.home ?? homedir()
    const python = this.#options.python ?? paddleVlmRuntimePython(home)
    const marker = this.#options.readinessMarker ?? join(runtimeRoot(home), ".ready-mlx-v1.6")
    const model = this.#options.modelDirectory ?? paddleVlmModelDirectory(home)
    try {
      await Promise.all([access(python), access(marker), access(model)])
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
    const port = await reserveLoopbackPort()
    const apiKey = randomUUID()
    const server = spawn(
      python,
      [
        "-m",
        "mlx_vlm.server",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--model",
        model,
        "--log-level",
        "ERROR",
      ],
      {
        env: paddleVlmServerEnvironment(home, apiKey),
        stdio: "ignore",
      },
    )
    this.#process = server
    try {
      await waitUntilReady(server, port)
    } catch (error) {
      server.kill()
      this.#process = null
      throw error
    }
    const connection = { serverUrl: `http://127.0.0.1:${port}/`, model, apiKey }
    this.#connection = connection
    server.once("exit", () => {
      if (this.#process === server) {
        this.#process = null
        this.#connection = null
      }
    })
    return connection
  }
}
