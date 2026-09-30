import { type ChildProcess, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { access, readFile } from "node:fs/promises"
import { createConnection, createServer } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { buildOfflineSubprocessEnv } from "./offlineSubprocessEnvironment"

export type PaddleVlmBackend = "mlx-vlm-server" | "vllm-server"
export type PaddleAcceleration = "mlx" | "vllm"

export type PaddleVlmConnection = {
  readonly backend: PaddleVlmBackend
  readonly serverUrl: string
  readonly model: string
  readonly apiKey: string
}

/** A server being started: the connection is known right away, `ready` settles once it answers. */
export type PaddleVlmLaunch = {
  readonly connection: PaddleVlmConnection
  readonly ready: Promise<void>
}

export interface PaddleVlmServer {
  /** The accelerator this machine has installed, or null when recognition runs in-process. */
  acceleration(): Promise<PaddleAcceleration | null>
  launch(): Promise<PaddleVlmLaunch | null>
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
    super(`Paddle VLM server failed: ${reason}`)
  }
}

/** Keeps the last 40 non-empty lines of a child's stderr for failure reports. */
export function appendLogTail(log: string[], chunk: string): void {
  log.push(...chunk.split("\n").filter((line) => line.trim()))
  log.splice(0, Math.max(0, log.length - 40))
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

/** A process that exited, or never started because spawning it failed. */
function processGone(process: ChildProcess): boolean {
  return process.exitCode !== null || process.pid === undefined
}

/**
 * How long a live server may take to open its port. It usually takes 5–10 s, but the first
 * start after an update or reboot reads the model and libraries from a cold disk while the
 * worker loads too, and giving up means recognizing on the CPU for the rest of the session.
 */
const READY_TIMEOUT_MS = 120_000

async function waitUntilReady(process: ChildProcess, port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (processGone(process)) throw new PaddleVlmLaunchError("process")
    if (await loopbackReady(port)) return
    await pause(100)
  }
  throw new PaddleVlmLaunchError("timeout")
}

export class ApplePaddleVlmServer implements PaddleVlmServer {
  readonly #options: ApplePaddleVlmServerOptions
  #process: ChildProcess | null = null
  #current: PaddleVlmLaunch | null = null
  #launching: Promise<PaddleVlmLaunch | null> | null = null

  constructor(options: ApplePaddleVlmServerOptions = {}) {
    this.#options = options
  }

  async acceleration(): Promise<PaddleAcceleration | null> {
    if (!this.#supported()) return null
    try {
      await Promise.all(this.#runtimeFiles().map((file) => access(file)))
      return "mlx"
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
  }

  launch(): Promise<PaddleVlmLaunch | null> {
    if (!this.#supported()) return Promise.resolve(null)
    if (this.#process?.exitCode === null && this.#current) return Promise.resolve(this.#current)
    if (this.#launching) return this.#launching
    this.#launching = this.#launch().finally(() => {
      this.#launching = null
    })
    return this.#launching
  }

  stop(): void {
    this.#current = null
    this.#launching = null
    this.#process?.kill()
    this.#process = null
  }

  #supported(): boolean {
    return (
      (this.#options.platform ?? process.platform) === "darwin" &&
      (this.#options.arch ?? process.arch) === "arm64"
    )
  }

  #runtimeFiles(): [python: string, marker: string, model: string] {
    const home = this.#options.home ?? homedir()
    return [
      this.#options.python ?? paddleVlmRuntimePython(home),
      this.#options.readinessMarker ?? join(runtimeRoot(home), ".ready-mlx-v1.6"),
      this.#options.modelDirectory ?? paddleVlmModelDirectory(home),
    ]
  }

  async #launch(): Promise<PaddleVlmLaunch | null> {
    const home = this.#options.home ?? homedir()
    const [python, marker, model] = this.#runtimeFiles()
    try {
      await Promise.all([access(python), access(marker), access(model)])
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
    const port = await reserveLoopbackPort()
    const apiKey = randomUUID()
    // Full priority, unlike the worker: the server is mostly GPU work, and at utility QoS it
    // came up too slowly after an update and left the whole session recognizing on the CPU.
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
    server.once("error", (error) => console.warn("[paddle-vlm] MLX-VLM server failed", error))
    server.once("exit", () => {
      if (this.#process === server) {
        this.#process = null
        this.#current = null
      }
    })
    const ready = waitUntilReady(server, port).catch((error: unknown) => {
      server.kill()
      throw error
    })
    // Callers await `ready`; this only keeps an early failure from being reported as unhandled.
    ready.catch(() => undefined)
    const launch: PaddleVlmLaunch = {
      connection: {
        backend: "mlx-vlm-server",
        serverUrl: `http://127.0.0.1:${port}/`,
        model,
        apiKey,
      },
      ready,
    }
    this.#current = launch
    return launch
  }
}

/** The model name the vLLM server in WSL serves PaddleOCR-VL under. */
export const WSL_VLLM_MODEL = "PaddleOCR-VL-1.6-0.9B"

const wslVllmRuntimeSchema = z.object({
  version: z.literal(1),
  distro: z.string().trim().min(1).max(128),
  root: z.string().regex(/^\/[^\0]+$/),
})

export type WslVllmRuntime = z.infer<typeof wslVllmRuntimeSchema>

/** Written by `npm run setup:paddle-vllm` once the WSL runtime passes its smoke test. */
export function wslVllmRuntimeConfigPath(home: string): string {
  return join(home, ".ohmypaper", "paddle-vllm-wsl.json")
}

export async function readWslVllmRuntime(home: string): Promise<WslVllmRuntime | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(wslVllmRuntimeConfigPath(home), "utf8"))
    return wslVllmRuntimeSchema.parse(raw)
  } catch (error) {
    if (isMissingFile(error) || error instanceof z.ZodError || error instanceof SyntaxError)
      return null
    throw error
  }
}

export function wslVllmServeArguments(runtime: WslVllmRuntime, port: number): string[] {
  return ["-d", runtime.distro, "--", "bash", `${runtime.root}/serve.sh`, String(port)]
}

async function waitForOpenAiServer(
  process: ChildProcess,
  serverUrl: string,
  apiKey: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (processGone(process)) throw new PaddleVlmLaunchError("process")
    try {
      const response = await fetch(`${serverUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(2_000),
      })
      if (response.ok) return
    } catch (error) {
      if (!(error instanceof Error)) throw error
    }
    await pause(1_000)
  }
  throw new PaddleVlmLaunchError("timeout")
}

export type WslPaddleVlmServerOptions = {
  readonly home?: string
  readonly platform?: NodeJS.Platform
  readonly spawnProcess?: typeof spawn
  readonly readyTimeoutMs?: number
}

/**
 * Runs PaddleOCR-VL behind vLLM inside WSL on Windows machines with an NVIDIA GPU.
 * vLLM has no native Windows build, and in-process recognition leaves the GPU mostly idle.
 */
export class WslPaddleVlmServer implements PaddleVlmServer {
  readonly #options: WslPaddleVlmServerOptions
  #process: ChildProcess | null = null
  #current: PaddleVlmLaunch | null = null
  #launching: Promise<PaddleVlmLaunch | null> | null = null
  #previousExit: Promise<void> = Promise.resolve()

  constructor(options: WslPaddleVlmServerOptions = {}) {
    this.#options = options
  }

  async acceleration(): Promise<PaddleAcceleration | null> {
    if ((this.#options.platform ?? process.platform) !== "win32") return null
    return (await readWslVllmRuntime(this.#options.home ?? homedir())) ? "vllm" : null
  }

  launch(): Promise<PaddleVlmLaunch | null> {
    if ((this.#options.platform ?? process.platform) !== "win32") return Promise.resolve(null)
    if (this.#process?.exitCode === null && this.#current) return Promise.resolve(this.#current)
    if (this.#launching) return this.#launching
    this.#launching = this.#launch().finally(() => {
      this.#launching = null
    })
    return this.#launching
  }

  stop(): void {
    const server = this.#process
    this.#current = null
    this.#launching = null
    this.#process = null
    if (!server) return
    // vLLM refuses to start while another server still holds its GPU memory.
    this.#previousExit = new Promise((resolve) => {
      if (processGone(server)) resolve()
      else server.once("exit", () => resolve())
    })
    // Closing stdin makes serve.sh stop vLLM and release the GPU; the kill is a backstop.
    server.stdin?.end()
    setTimeout(() => {
      if (server.exitCode === null) server.kill()
    }, 15_000).unref()
  }

  async #launch(): Promise<PaddleVlmLaunch | null> {
    const runtime = await readWslVllmRuntime(this.#options.home ?? homedir())
    if (!runtime) return null
    await this.#previousExit
    const port = await reserveLoopbackPort()
    const apiKey = randomUUID()
    const server = (this.#options.spawnProcess ?? spawn)(
      "wsl.exe",
      wslVllmServeArguments(runtime, port),
      {
        env: buildOfflineSubprocessEnv({}),
        stdio: ["pipe", "ignore", "pipe"],
        windowsHide: true,
      },
    )
    this.#process = server
    server.once("error", (error) => console.warn("[paddle-vllm] could not run wsl.exe", error))
    const log: string[] = []
    server.stderr?.setEncoding("utf8")
    server.stderr?.on("data", (chunk: string) => appendLogTail(log, chunk))
    server.once("exit", () => {
      if (this.#process === server) {
        this.#process = null
        this.#current = null
      }
    })
    server.stdin?.write(`${apiKey}\n`)
    const serverUrl = `http://127.0.0.1:${port}/v1`
    const ready = waitForOpenAiServer(
      server,
      serverUrl,
      apiKey,
      this.#options.readyTimeoutMs ?? 300_000,
    ).catch((error: unknown) => {
      // A server stopped on purpose while starting is not a failure worth reporting.
      if (this.#process === server) {
        console.warn(`[paddle-vllm] server in WSL did not start:\n${log.join("\n")}`)
        this.stop()
      }
      throw error
    })
    // Callers await `ready`; this only keeps an early failure from being reported as unhandled.
    ready.catch(() => undefined)
    const launch: PaddleVlmLaunch = {
      connection: { backend: "vllm-server", serverUrl, model: WSL_VLLM_MODEL, apiKey },
      ready,
    }
    this.#current = launch
    return launch
  }
}

/** Picks the accelerated VLM server this platform supports. */
export function createPaddleVlmServer(options: { readonly home?: string } = {}): PaddleVlmServer {
  return process.platform === "win32"
    ? new WslPaddleVlmServer(options)
    : new ApplePaddleVlmServer(options)
}
