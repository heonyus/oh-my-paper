import { z } from "zod"
import type { CodexConfigReadResult } from "../shared/codexProtocol"
import {
  type CodexAgentMessageDeltaNotification,
  type CodexLoginCompletedEvent,
  type CodexLoginStartResult,
  type CodexTurnCompletedNotification,
  codexConfigReadResultSchema,
  codexGetAccountResultSchema,
  codexGetRateLimitsResultSchema,
  codexLoginStartResultSchema,
  codexModelListResultSchema,
  codexProviderCapabilitiesReadResultSchema,
} from "../shared/codexProtocol"
import {
  type CodexAccount,
  type CodexAccountRateLimits,
  type CodexLoginType,
  type CodexModel,
  codexModelFromRuntime,
} from "../shared/codexTypes"
import {
  handleCodexIncomingMessage,
  handleCodexSubprocessError,
  handleCodexSubprocessExit,
} from "./codexAppServerEvents"
import { CodexAppServerError, type PendingRequest } from "./codexClientDispatch"
import { sanitizeErrorMessage } from "./codexEnvironment"
import { parseCodexIncomingMessage } from "./codexProtocolRouter"
import { CodexSubprocess, type CodexSubprocessOptions } from "./codexSubprocess"

export { CodexAppServerError }

export class CodexAppServerClient {
  readonly #subprocess: CodexSubprocess
  readonly #pending = new Map<string, PendingRequest>()
  #nextId = 1
  #initialized = false
  #startPromise: Promise<void> | null = null
  readonly #loginCompletedListeners = new Set<(event: CodexLoginCompletedEvent) => void>()
  readonly #deltaListeners = new Set<(notif: CodexAgentMessageDeltaNotification) => void>()
  readonly #turnCompletedListeners = new Set<(notif: CodexTurnCompletedNotification) => void>()
  readonly #exitListeners = new Set<(code: number | null) => void>()

  constructor(options: CodexSubprocessOptions) {
    this.#subprocess = new CodexSubprocess(options)
    this.#subprocess.onLine((line) => this.#handleLine(line))
    this.#subprocess.onError((err) => this.#handleSubprocessError(err))
    this.#subprocess.onExit((code) => this.#handleSubprocessExit(code))
  }

  get isRunning(): boolean {
    return this.#subprocess.isRunning
  }

  async ensureStarted(): Promise<void> {
    if (this.#initialized) return
    if (this.#startPromise === null) this.#startPromise = this.#initialize()
    await this.#startPromise
  }

  async #initialize(): Promise<void> {
    try {
      if (!this.#subprocess.isRunning) {
        await this.#subprocess.start()
        this.#initialized = false
      }
      await this.request(
        "initialize",
        {
          clientInfo: {
            name: "ohmypaper",
            title: "oh-my-paper Reader",
            version: "2.0.0",
          },
        },
        z.unknown(),
      )
      this.#subprocess.writeLine(JSON.stringify({ method: "initialized", params: {} }))
      this.#initialized = true
    } finally {
      this.#startPromise = null
    }
  }

  async request<T>(
    method: string,
    params: unknown,
    schema: z.ZodType<T>,
    timeoutMs = 15_000,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.#subprocess.isRunning && method !== "initialize") {
      await this.ensureStarted()
    }
    const id = String(this.#nextId++)
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        settled = true
        signal?.removeEventListener("abort", abort)
        reject(new CodexAppServerError(`Request ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      const abort = () => {
        if (settled) return
        this.#pending.delete(id)
        settled = true
        clearTimeout(timer)
        reject(new CodexAppServerError(`Request ${method} aborted`))
      }
      signal?.addEventListener("abort", abort, { once: true })

      this.#pending.set(id, {
        resolve: (raw: unknown) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener("abort", abort)
          const parsed = schema.safeParse(raw)
          if (!parsed.success) {
            reject(
              new CodexAppServerError(`Invalid response for ${method}: ${parsed.error.message}`),
            )
          } else {
            resolve(parsed.data)
          }
        },
        reject: (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener("abort", abort)
          reject(error)
        },
        timer,
      })

      if (signal?.aborted) {
        abort()
        return
      }

      const message = JSON.stringify({ id, method, ...(params !== undefined ? { params } : {}) })
      try {
        this.#subprocess.writeLine(message)
      } catch (err) {
        clearTimeout(timer)
        this.#pending.delete(id)
        settled = true
        signal?.removeEventListener("abort", abort)
        reject(
          err instanceof Error
            ? new CodexAppServerError(sanitizeErrorMessage(err.message))
            : new CodexAppServerError("Codex request failed with an unknown error"),
        )
      }
    })
  }

  #handleLine(line: string): void {
    const message = parseCodexIncomingMessage(line)
    if (message === null) return
    handleCodexIncomingMessage(
      message,
      this.#pending,
      (lineToWrite) => this.#subprocess.writeLine(lineToWrite),
      {
        loginCompleted: this.#loginCompletedListeners,
        delta: this.#deltaListeners,
        turnCompleted: this.#turnCompletedListeners,
        exit: this.#exitListeners,
      },
    )
  }

  #handleSubprocessError(error: Error): void {
    handleCodexSubprocessError(error, this.#pending)
  }

  #handleSubprocessExit(code: number | null): void {
    this.#initialized = false
    handleCodexSubprocessExit(code, this.#pending, this.#exitListeners)
  }

  onLoginCompleted(listener: (event: CodexLoginCompletedEvent) => void): () => void {
    this.#loginCompletedListeners.add(listener)
    return () => {
      this.#loginCompletedListeners.delete(listener)
    }
  }

  onDelta(listener: (notif: CodexAgentMessageDeltaNotification) => void): () => void {
    this.#deltaListeners.add(listener)
    return () => {
      this.#deltaListeners.delete(listener)
    }
  }

  onTurnCompleted(listener: (notif: CodexTurnCompletedNotification) => void): () => void {
    this.#turnCompletedListeners.add(listener)
    return () => {
      this.#turnCompletedListeners.delete(listener)
    }
  }

  onExit(listener: (code: number | null) => void): () => void {
    this.#exitListeners.add(listener)
    return () => {
      this.#exitListeners.delete(listener)
    }
  }

  async readAccount(): Promise<{ account: CodexAccount | null; requiresOpenaiAuth: boolean }> {
    await this.ensureStarted()
    return this.request("account/read", {}, codexGetAccountResultSchema)
  }

  async startLogin(type: CodexLoginType = "chatgpt"): Promise<CodexLoginStartResult> {
    await this.ensureStarted()
    return this.request("account/login/start", { type }, codexLoginStartResultSchema)
  }

  async cancelLogin(loginId: string): Promise<void> {
    await this.ensureStarted()
    await this.request("account/login/cancel", { loginId }, z.unknown())
  }

  async logout(): Promise<void> {
    await this.ensureStarted()
    await this.request("account/logout", null, z.unknown())
  }

  async readRateLimits(): Promise<CodexAccountRateLimits> {
    await this.ensureStarted()
    return this.request("account/rateLimits/read", null, codexGetRateLimitsResultSchema)
  }

  async readProviderCapabilities(): Promise<{ readonly webSearch: boolean }> {
    await this.ensureStarted()
    const capabilities = await this.request(
      "modelProvider/capabilities/read",
      {},
      codexProviderCapabilitiesReadResultSchema,
    )
    return { webSearch: capabilities.webSearch }
  }

  /** The models this account can pick, in the runtime's own order. */
  async listModels(): Promise<readonly CodexModel[]> {
    await this.ensureStarted()
    const result = await this.request("model/list", { limit: 50 }, codexModelListResultSchema)
    return result.data.filter((model) => !model.hidden).map(codexModelFromRuntime)
  }

  async readEffectiveConfig(): Promise<CodexConfigReadResult> {
    await this.ensureStarted()
    return this.request("config/read", { includeLayers: true }, codexConfigReadResultSchema)
  }

  stop(): void {
    this.#subprocess.stop()
    this.#handleSubprocessExit(null)
  }

  dispose(): void {
    this.#loginCompletedListeners.clear()
    this.#deltaListeners.clear()
    this.#turnCompletedListeners.clear()
    this.#exitListeners.clear()
    this.stop()
  }
}
