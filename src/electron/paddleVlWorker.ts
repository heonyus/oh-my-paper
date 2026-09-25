import { type ChildProcess, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { appendLogTail, type PaddleVlmConnection } from "./paddleVlmServer"

const workerMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("ready") }),
  z.object({ event: z.literal("page"), id: z.string(), pageNumber: z.number().int().positive() }),
  z.object({ event: z.literal("done"), id: z.string() }),
  z.object({ event: z.literal("failed"), id: z.string(), reason: z.string() }),
])

export type PaddleVlWorkerRequest = {
  readonly pdfPath: string
  readonly sourceHash: string
  readonly pages: readonly number[]
  readonly outputDir: string
}

export type PaddleVlWorkerLaunch = {
  readonly python: string
  readonly script: string
  readonly env: NodeJS.ProcessEnv
  readonly vlm: PaddleVlmConnection | null
  readonly readyTimeoutMs?: number
  readonly pageTimeoutMs?: number
  readonly spawnProcess?: typeof spawn
}

export class PaddleVlWorkerError extends Error {
  readonly name = "PaddleVlWorkerError"

  constructor(
    readonly reason: "exited" | "timeout" | "failed" | "busy",
    readonly detail?: string,
  ) {
    super(`PaddleOCR-VL worker ${reason}${detail ? `: ${detail}` : ""}`)
  }
}

type ActiveRequest = {
  readonly id: string
  readonly onPage: (pageNumber: number) => void
  readonly resolve: () => void
  readonly reject: (error: Error) => void
}

export function paddleVlWorkerArguments(script: string, vlm: PaddleVlmConnection | null): string[] {
  if (!vlm) return [script]
  return [
    script,
    "--vlm-backend",
    vlm.backend,
    "--vlm-server-url",
    vlm.serverUrl,
    "--vlm-model",
    vlm.model,
  ]
}

/**
 * A long-lived Python process that keeps PaddleOCR-VL loaded and parses batches of pages,
 * reporting each page as soon as its JSON is written. It handles one request at a time.
 */
export class PaddleVlWorker {
  readonly #process: ChildProcess
  readonly #pageTimeoutMs: number
  readonly #log: string[] = []
  #buffer = ""
  #active: ActiveRequest | null = null
  #stall: NodeJS.Timeout | null = null
  #exited = false
  #stopping = false
  #timedOut = false
  #onReady: (() => void) | null = null
  #onExit: ((error: Error) => void) | null = null

  private constructor(launch: PaddleVlWorkerLaunch) {
    this.#pageTimeoutMs = launch.pageTimeoutMs ?? 300_000
    this.#process = (launch.spawnProcess ?? spawn)(
      launch.python,
      paddleVlWorkerArguments(launch.script, launch.vlm),
      { env: launch.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    )
    this.#process.stdout?.setEncoding("utf8")
    this.#process.stdout?.on("data", (chunk: string) => this.#receive(chunk))
    this.#process.stderr?.setEncoding("utf8")
    this.#process.stderr?.on("data", (chunk: string) => appendLogTail(this.#log, chunk))
    this.#process.once("error", (error) => this.#exit(error))
    this.#process.once("exit", () => this.#exit(null))
  }

  static async start(launch: PaddleVlWorkerLaunch): Promise<PaddleVlWorker> {
    const worker = new PaddleVlWorker(launch)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.#timedOut = true
        worker.#process.kill()
      }, launch.readyTimeoutMs ?? 300_000)
      worker.#onReady = () => {
        clearTimeout(timer)
        resolve()
      }
      worker.#onExit = (error) => {
        clearTimeout(timer)
        reject(error)
      }
    })
    worker.#onReady = null
    worker.#onExit = null
    return worker
  }

  get alive(): boolean {
    return !this.#exited
  }

  parse(request: PaddleVlWorkerRequest, onPage: (pageNumber: number) => void): Promise<void> {
    if (this.#exited) return Promise.reject(new PaddleVlWorkerError("exited"))
    if (this.#active) return Promise.reject(new PaddleVlWorkerError("busy"))
    const id = randomUUID()
    return new Promise<void>((resolve, reject) => {
      this.#active = { id, onPage, resolve, reject }
      this.#armStallTimer()
      this.#process.stdin?.write(`${JSON.stringify({ id, ...request })}\n`)
    })
  }

  stop(): void {
    if (this.#exited) return
    this.#stopping = true
    // Closing stdin ends the request loop; the kill covers a worker stuck mid-request.
    this.#process.stdin?.end()
    setTimeout(() => {
      if (!this.#exited) this.#process.kill()
    }, 5_000).unref()
  }

  #armStallTimer(): void {
    if (this.#stall) clearTimeout(this.#stall)
    this.#stall = setTimeout(() => {
      this.#timedOut = true
      this.#process.kill()
    }, this.#pageTimeoutMs)
  }

  #finishActive(): ActiveRequest | null {
    const active = this.#active
    this.#active = null
    if (this.#stall) clearTimeout(this.#stall)
    this.#stall = null
    return active
  }

  #receive(chunk: string): void {
    this.#buffer += chunk
    const lines = this.#buffer.split("\n")
    this.#buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      let raw: unknown
      try {
        raw = JSON.parse(line)
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        continue
      }
      const message = workerMessageSchema.safeParse(raw)
      if (message.success) this.#handle(message.data)
    }
  }

  #handle(message: z.infer<typeof workerMessageSchema>): void {
    if (message.event === "ready") {
      this.#onReady?.()
      return
    }
    const active = this.#active
    if (!active) return
    if (message.event === "page") {
      if (message.id !== active.id) return
      this.#armStallTimer()
      active.onPage(message.pageNumber)
      return
    }
    // A failure without an id means the worker could not read the request at all.
    if (message.id !== active.id && !(message.event === "failed" && message.id === "")) return
    this.#finishActive()
    if (message.event === "done") active.resolve()
    else active.reject(new PaddleVlWorkerError("failed", message.reason))
  }

  #exit(error: Error | null): void {
    if (this.#exited) return
    this.#exited = true
    const reason = error ?? new PaddleVlWorkerError(this.#timedOut ? "timeout" : "exited")
    if (!this.#stopping && this.#log.length > 0)
      console.warn(`[paddle-vl] worker stopped:\n${this.#log.join("\n")}`)
    this.#onExit?.(reason)
    this.#finishActive()?.reject(reason)
  }
}
