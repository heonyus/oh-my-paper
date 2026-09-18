import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat } from "node:fs/promises"
import type { Readable } from "node:stream"
import { request as httpRequest } from "undici"
import { z } from "zod"
import {
  LOCAL_INFERENCE_LIMITS,
  type LocalInferenceEngine,
  type LocalInferenceSetupManifest,
  type LocalInferenceSuggestRequest,
} from "../shared/localInference"

const completionSchema = z.object({
  content: z.string().max(LOCAL_INFERENCE_LIMITS.maxCompletionCharacters),
})
const FORCE_KILL_DELAY_MS = 500
const INHERITED_ENVIRONMENT_KEYS = ["LANG", "LC_ALL", "PATH", "TMPDIR"] as const

async function fileHash(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(path)
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(hash.digest("hex")))
  })
}

function childAlive(child: ChildProcessWithoutNullStreams): boolean {
  if (child.exitCode !== null || child.pid === undefined) return false
  try {
    process.kill(child.pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
}

export class LocalInferenceEngineError extends Error {
  readonly name = "LocalInferenceEngineError"
}

export function buildLocalInferenceEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const key of INHERITED_ENVIRONMENT_KEYS) {
    const value = source[key]
    if (value !== undefined) environment[key] = value
  }
  return environment
}

export function parseLlamaCppCompletion(value: unknown): string {
  return completionSchema.parse(value).content
}

export function readBoundedLlamaCppBody(body: Readable, limit: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let length = 0
    let settled = false
    const cleanup = (): void => {
      body.off("data", onData)
      body.off("end", onEnd)
      body.off("error", onError)
    }
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onData = (chunk: Buffer): void => {
      length += chunk.byteLength
      if (length > limit) {
        finish(() => {
          body.destroy()
          reject(new LocalInferenceEngineError("llama.cpp response exceeded the limit"))
        })
        return
      }
      chunks.push(chunk)
    }
    const onEnd = (): void => finish(() => resolve(Buffer.concat(chunks).toString("utf8")))
    const onError = (error: Error): void => finish(() => reject(error))
    body.on("data", onData)
    body.once("end", onEnd)
    body.once("error", onError)
  })
}

export function waitForLlamaCppPort(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let output = ""
    let settled = false
    const cleanup = (): void => {
      clearTimeout(timeout)
      child.stdout.off("data", onData)
      child.stderr.off("data", onData)
      child.off("error", onError)
      child.off("exit", onExit)
    }
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onData = (chunk: Buffer): void => {
      output = `${output}${chunk.toString("utf8")}`.slice(-8_192)
      const match = /127\.0\.0\.1:(\d{1,5})/u.exec(output)
      if (match?.[1] === undefined) return
      const port = Number(match[1])
      if (port > 0 && port <= 65_535) finish(() => resolve(port))
    }
    const onError = (error: Error): void => finish(() => reject(error))
    const onExit = (): void =>
      finish(() => reject(new LocalInferenceEngineError("llama.cpp exited during startup")))
    const timeout = setTimeout(
      () =>
        finish(() => {
          child.kill("SIGKILL")
          reject(new LocalInferenceEngineError("llama.cpp startup timed out"))
        }),
      timeoutMs,
    )
    timeout.unref()
    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    child.once("error", onError)
    child.once("exit", onExit)
  })
}

export class LlamaCppEngine implements LocalInferenceEngine {
  #process: ChildProcessWithoutNullStreams | null = null
  #port: number | null = null
  #authToken: string | null = null
  #start: Promise<void> | null = null
  #idleTimer: NodeJS.Timeout | null = null
  #activeAbort: AbortController | null = null

  async complete(
    request: LocalInferenceSuggestRequest,
    manifest: LocalInferenceSetupManifest,
  ): Promise<string> {
    this.#clearIdleUnload()
    await this.#ensureStarted(manifest)
    const child = this.#process
    const port = this.#port
    const token = this.#authToken
    if (child === null || port === null || token === null || !childAlive(child)) {
      throw new LocalInferenceEngineError("llama.cpp server is not owned and running")
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LOCAL_INFERENCE_LIMITS.requestTimeoutMs)
    this.#activeAbort = controller
    try {
      const response = await httpRequest(`http://127.0.0.1:${port}/completion`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: this.#prompt(request),
          n_predict: LOCAL_INFERENCE_LIMITS.maxOutputTokens,
          temperature: 0.2,
          cache_prompt: false,
        }),
        headersTimeout: LOCAL_INFERENCE_LIMITS.requestTimeoutMs,
        bodyTimeout: LOCAL_INFERENCE_LIMITS.requestTimeoutMs,
        signal: controller.signal,
      })
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.body.destroy()
        throw new LocalInferenceEngineError("llama.cpp returned an inference error")
      }
      const body = await readBoundedLlamaCppBody(
        response.body,
        LOCAL_INFERENCE_LIMITS.maxCompletionCharacters,
      )
      return parseLlamaCppCompletion(JSON.parse(body))
    } finally {
      clearTimeout(timeout)
      this.#activeAbort = null
      this.#scheduleIdleUnload()
    }
  }

  cancel(_requestId: string): void {
    this.#activeAbort?.abort()
    this.#stop()
  }

  dispose(): void {
    this.#stop()
  }

  async #ensureStarted(manifest: LocalInferenceSetupManifest): Promise<void> {
    if (this.#process !== null && this.#port !== null && childAlive(this.#process)) return
    if (this.#start !== null) return this.#start
    this.#start = this.#startProcess(manifest).finally(() => {
      this.#start = null
    })
    return this.#start
  }

  async #startProcess(manifest: LocalInferenceSetupManifest): Promise<void> {
    const runtimeStats = await lstat(manifest.runtimePath)
    if (
      !runtimeStats.isFile() ||
      (await fileHash(manifest.runtimePath)) !== manifest.runtimeExecutableSha256
    ) {
      throw new LocalInferenceEngineError("selected llama.cpp executable is not verified")
    }
    const token = randomBytes(32).toString("hex")
    const child = spawn(
      manifest.runtimePath,
      [
        "--model",
        manifest.modelPath,
        "--ctx-size",
        String(LOCAL_INFERENCE_LIMITS.contextTokens),
        "--n-predict",
        String(LOCAL_INFERENCE_LIMITS.maxOutputTokens),
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--api-key",
        token,
        "--parallel",
        "1",
      ],
      {
        env: buildLocalInferenceEnvironment(process.env),
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
    this.#process = child
    this.#authToken = token
    try {
      const port = await waitForLlamaCppPort(child, LOCAL_INFERENCE_LIMITS.startupTimeoutMs)
      this.#port = port
      const response = await httpRequest(`http://127.0.0.1:${port}/health`, {
        headers: { authorization: `Bearer ${token}` },
        headersTimeout: LOCAL_INFERENCE_LIMITS.requestTimeoutMs,
        bodyTimeout: LOCAL_INFERENCE_LIMITS.requestTimeoutMs,
      })
      if (response.statusCode < 200 || response.statusCode >= 300 || !childAlive(child)) {
        response.body.destroy()
        throw new LocalInferenceEngineError("llama.cpp health check failed")
      }
      await readBoundedLlamaCppBody(response.body, LOCAL_INFERENCE_LIMITS.maxCompletionCharacters)
    } catch (error) {
      this.#stop()
      if (error instanceof Error) throw error
      throw new LocalInferenceEngineError("llama.cpp startup failed")
    }
  }

  #prompt(request: LocalInferenceSuggestRequest): string {
    return [
      "Continue this note with one concise plain-text passage.",
      "Do not add tags, links, bullets, headings, or metadata. Preserve meaningful line breaks.",
      `Node title: ${request.nodeTitle}`,
      `Draft:\n${request.draft}`,
    ].join("\n\n")
  }

  #scheduleIdleUnload(): void {
    this.#clearIdleUnload()
    if (this.#process === null) return
    this.#idleTimer = setTimeout(() => this.#stop(), LOCAL_INFERENCE_LIMITS.idleUnloadMs)
  }

  #clearIdleUnload(): void {
    if (this.#idleTimer === null) return
    clearTimeout(this.#idleTimer)
    this.#idleTimer = null
  }

  #stop(): void {
    this.#clearIdleUnload()
    this.#activeAbort?.abort()
    this.#activeAbort = null
    const child = this.#process
    if (child !== null && childAlive(child)) {
      child.kill()
      const forceKill = setTimeout(() => {
        if (childAlive(child)) child.kill("SIGKILL")
      }, FORCE_KILL_DELAY_MS)
      forceKill.unref()
    }
    this.#process = null
    this.#port = null
    this.#authToken = null
  }
}
