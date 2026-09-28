import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { type ClaudeAccountStatus, claudeAccountStatusSchema } from "../shared/claudeTypes"
import { ClaudeLoginProcess, readClaudeAuthStatus } from "./claudeCliAuth"
import { type ClaudeCompletionOptions, runClaudeCompletion } from "./claudeCliCompletion"
import { findClaudeExecutable, sanitizeClaudeMessage } from "./claudeCliEnvironment"
import { ProviderConfigurationError } from "./providerConfigStore"

export type ClaudeSubscriptionAdapterOptions = {
  readonly appRoot: string
  readonly executablePath?: string | undefined
  readonly maxConcurrency?: number | undefined
  readonly statusTtlMs?: number | undefined
}

/**
 * Personal-use bridge to the locally installed Claude Code CLI. It reuses the CLI's own
 * login (no token is read or copied) and runs each request as a tool-less, headless turn.
 */
export class ClaudeSubscriptionAdapter {
  readonly #executablePath: string | null
  readonly #workdir: string
  readonly #maxConcurrency: number
  readonly #statusTtlMs: number
  readonly #login: ClaudeLoginProcess | null
  readonly #waiting: Array<() => void> = []
  #running = 0
  #cached: { readonly status: ClaudeAccountStatus; readonly at: number } | null = null

  constructor(options: ClaudeSubscriptionAdapterOptions) {
    this.#executablePath = findClaudeExecutable(options.executablePath)
    this.#workdir = join(options.appRoot, "claude-workspace")
    this.#maxConcurrency = Math.max(1, options.maxConcurrency ?? 3)
    this.#statusTtlMs = options.statusTtlMs ?? 30_000
    this.#login = this.#executablePath
      ? new ClaudeLoginProcess(this.#executablePath, () => {
          this.#cached = null
        })
      : null
  }

  get isAvailable(): boolean {
    return this.#executablePath !== null
  }

  async getStatus(options: { readonly fresh?: boolean } = {}): Promise<ClaudeAccountStatus> {
    const loginState = {
      loginPending: this.#login?.pending ?? false,
      loginUrl: this.#login?.url ?? null,
    }
    if (!this.#executablePath) {
      return claudeAccountStatusSchema.parse({
        available: false,
        authenticated: false,
        email: null,
        subscriptionType: null,
        ...loginState,
        error: "Claude Code CLI(claude)를 찾지 못했습니다",
      })
    }
    const cached = this.#cached
    if (!options.fresh && cached && Date.now() - cached.at < this.#statusTtlMs) {
      return { ...cached.status, ...loginState }
    }
    try {
      const auth = await readClaudeAuthStatus(this.#executablePath)
      const status = claudeAccountStatusSchema.parse({
        available: true,
        authenticated: auth.loggedIn,
        email: auth.email,
        subscriptionType: auth.subscriptionType,
        ...loginState,
      })
      this.#cached = { status, at: Date.now() }
      return status
    } catch (error) {
      return claudeAccountStatusSchema.parse({
        available: true,
        authenticated: false,
        email: null,
        subscriptionType: null,
        ...loginState,
        error:
          error instanceof Error
            ? sanitizeClaudeMessage(error.message)
            : "Claude 로그인 상태 확인 실패",
      })
    }
  }

  async startLogin(): Promise<ClaudeAccountStatus> {
    if (!this.#login) return this.getStatus()
    await this.#login.start()
    return this.getStatus()
  }

  async cancelLogin(): Promise<ClaudeAccountStatus> {
    this.#login?.cancel()
    return this.getStatus()
  }

  async runCompletion(options: ClaudeCompletionOptions): Promise<string> {
    const executablePath = this.#executablePath
    if (!executablePath) throw new ProviderConfigurationError("auth")
    const status = await this.getStatus()
    if (!status.authenticated) throw new ProviderConfigurationError("auth")
    await this.#acquire(options.signal)
    try {
      await mkdir(this.#workdir, { recursive: true })
      return await runClaudeCompletion(executablePath, this.#workdir, options)
    } catch (error) {
      if (error instanceof ProviderConfigurationError && error.kind === "auth") this.#cached = null
      throw error
    } finally {
      this.#release()
    }
  }

  dispose(): void {
    this.#login?.cancel()
  }

  async #acquire(signal: AbortSignal | undefined): Promise<void> {
    if (signal?.aborted) throw new ProviderConfigurationError("cancelled")
    if (this.#running < this.#maxConcurrency) {
      this.#running++
      return
    }
    await new Promise<void>((resolve, reject) => {
      const grant = (): void => {
        signal?.removeEventListener("abort", onAbort)
        this.#running++
        resolve()
      }
      const onAbort = (): void => {
        const index = this.#waiting.indexOf(grant)
        if (index >= 0) this.#waiting.splice(index, 1)
        reject(new ProviderConfigurationError("cancelled"))
      }
      signal?.addEventListener("abort", onAbort, { once: true })
      this.#waiting.push(grant)
    })
  }

  #release(): void {
    this.#running--
    this.#waiting.shift()?.()
  }
}
