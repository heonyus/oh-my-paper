import { join } from "node:path"
import {
  type CodexAccountRateLimits,
  type CodexAccountStatus,
  type CodexLoginCompletedEvent,
  type CodexLoginStartResult,
  codexAccountStatusSchema,
  codexLoginTypeSchema,
} from "../shared/codexTypes"
import { CodexAppServerClient, CodexAppServerError } from "./codexAppServerClient"
import { type CodexCompletionOptions, runCodexCompletion } from "./codexCompletion"
import { CodexEnvironmentError, sanitizeErrorMessage } from "./codexEnvironment"
import { CodexSession } from "./codexSession"
import { findCodexExecutable } from "./codexSubprocess"
import { createCodexWebSearchPort } from "./codexWebSearch"
import { ProviderConfigurationError } from "./providerConfigStore"
import type { OfficialWebSearchPort } from "./webDiscovery"

export type CodexSubscriptionAdapterOptions = {
  readonly appRoot: string
  readonly executablePath?: string | undefined
}

export class CodexSubscriptionAdapter {
  readonly #client: CodexAppServerClient
  readonly #session: CodexSession
  readonly #officialSearchPort: OfficialWebSearchPort
  readonly #executablePath: string | null
  #activeOperations = 0
  #loginPending = false

  constructor(options: CodexSubscriptionAdapterOptions) {
    const codexHome = join(options.appRoot, "codex-home")
    const workdir = join(options.appRoot, "codex-workspace")
    this.#executablePath = findCodexExecutable(options.executablePath)

    this.#client = new CodexAppServerClient({
      executablePath: this.#executablePath ?? undefined,
      codexHome,
      workdir,
    })
    this.#session = new CodexSession(this.#client, workdir)
    this.#officialSearchPort = createCodexWebSearchPort({
      getStatus: () => this.getStatus(),
      client: this.#client,
    })
    this.#client.onLoginCompleted(() => {
      this.#loginPending = false
    })
  }

  get isAvailable(): boolean {
    return this.#executablePath !== null
  }

  get executablePath(): string | null {
    return this.#executablePath
  }

  get officialSearchPort(): OfficialWebSearchPort {
    return this.#officialSearchPort
  }

  async getStatus(): Promise<CodexAccountStatus> {
    if (!this.#executablePath) {
      return codexAccountStatusSchema.parse({
        available: false,
        authenticated: false,
        account: null,
        requiresOpenaiAuth: true,
        executablePath: null,
        error: "Codex executable not found",
      })
    }

    const wasRunning = this.#client.isRunning
    this.#activeOperations++
    try {
      const { account, requiresOpenaiAuth } = await this.#client.readAccount()
      const authenticated = account?.type === "chatgpt"
      let rateLimits: CodexAccountRateLimits | null = null
      if (authenticated) {
        try {
          rateLimits = await this.#client.readRateLimits()
        } catch (error) {
          if (!(error instanceof CodexAppServerError)) throw error
        }
      }

      return codexAccountStatusSchema.parse({
        available: true,
        authenticated,
        account,
        requiresOpenaiAuth,
        rateLimits,
        executablePath: this.#executablePath,
      })
    } catch (err) {
      return codexAccountStatusSchema.parse({
        available: true,
        authenticated: false,
        account: null,
        requiresOpenaiAuth: true,
        executablePath: this.#executablePath,
        error:
          err instanceof Error ? sanitizeErrorMessage(err.message) : "Codex status request failed",
      })
    } finally {
      this.#activeOperations--
      if (!wasRunning && this.#activeOperations === 0 && !this.#loginPending) {
        this.#client.stop()
      }
    }
  }

  async assertAuthenticated(): Promise<void> {
    const status = await this.getStatus()
    if (!status.authenticated) throw new ProviderConfigurationError("auth")
  }

  async startLogin(type = "chatgpt"): Promise<CodexLoginStartResult> {
    if (!this.#executablePath) {
      throw new CodexEnvironmentError(
        "executable_missing",
        "Codex executable not found. Please install Codex first.",
      )
    }
    const safeType = codexLoginTypeSchema.parse(type)
    this.#loginPending = true
    try {
      return await this.#client.startLogin(safeType)
    } catch (error) {
      this.#loginPending = false
      throw error
    }
  }

  async cancelLogin(loginId: string): Promise<void> {
    if (!this.#executablePath) return
    await this.#client.cancelLogin(loginId)
    this.#loginPending = false
  }

  async logout(): Promise<void> {
    if (!this.#executablePath) return
    await this.#client.logout()
    this.#loginPending = false
  }

  onLoginCompleted(listener: (event: CodexLoginCompletedEvent) => void): () => void {
    return this.#client.onLoginCompleted(listener)
  }

  async runCompletion(params: CodexCompletionOptions): Promise<string> {
    if (!this.#executablePath) {
      throw new CodexEnvironmentError("executable_missing", "Codex executable not found")
    }
    await this.assertAuthenticated()
    this.#activeOperations++
    try {
      return await runCodexCompletion(this.#session, this.#client, params)
    } finally {
      this.#activeOperations--
    }
  }

  dispose(): void {
    this.#client.dispose()
    this.#activeOperations = 0
  }
}
