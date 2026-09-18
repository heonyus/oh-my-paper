import {
  type LocalInferenceEngine,
  type LocalInferenceSetupCheck,
  type LocalInferenceSetupManifest,
  type LocalInferenceStatus,
  type LocalInferenceSuggestRequest,
  type LocalInferenceSuggestResult,
  localInferenceSetupCheckSchema,
  localInferenceSetupManifestSchema,
  localInferenceStatusSchema,
  localInferenceSuggestRequestSchema,
  localInferenceSuggestResultSchema,
} from "../shared/localInference"

export type LocalInferenceServiceOptions = {
  readonly checkSetup: (manifest: LocalInferenceSetupManifest) => Promise<LocalInferenceSetupCheck>
  readonly chooseSetup?: () => Promise<LocalInferenceSetupManifest | null>
  readonly saveSetup?: (manifest: LocalInferenceSetupManifest) => Promise<void>
  readonly engine: LocalInferenceEngine
  readonly initialManifest?: LocalInferenceSetupManifest | null
  readonly platform?: NodeJS.Platform
  readonly arch?: string
}

type PendingSuggestion = {
  readonly request: LocalInferenceSuggestRequest
  readonly manifest: LocalInferenceSetupManifest
  readonly resolve: (result: LocalInferenceSuggestResult) => void
}

export class LocalInferenceService {
  readonly #options: LocalInferenceServiceOptions
  #enabled = false
  #manifest: LocalInferenceSetupManifest | null = null
  #setupCheck: Promise<LocalInferenceSetupCheck> | null = null
  #activeRequestId: string | null = null
  #pending: PendingSuggestion | null = null
  #draining = false
  #cancelledActiveRequestId: string | null = null
  #disposed = false

  constructor(options: LocalInferenceServiceOptions) {
    this.#options = options
    this.#manifest = localInferenceSetupManifestSchema
      .nullable()
      .parse(options.initialManifest ?? null)
  }

  async chooseSetup(): Promise<LocalInferenceSetupManifest | null> {
    this.#stopPending()
    this.#cancelActive()
    const selection = (await this.#options.chooseSetup?.()) ?? null
    if (selection === null) return null
    const manifest = localInferenceSetupManifestSchema.parse(selection)
    this.#manifest = manifest
    this.#setupCheck = this.#options.checkSetup(manifest)
    const setup = localInferenceSetupCheckSchema.parse(await this.#setupCheck)
    if (setup.status === "ready") await this.#options.saveSetup?.(manifest)
    return manifest
  }

  async setEnabled(enabled: boolean): Promise<LocalInferenceStatus> {
    this.#enabled = enabled
    if (!enabled) {
      this.#stopPending()
      this.#cancelActive()
    }
    return this.getStatus()
  }

  async getStatus(): Promise<LocalInferenceStatus> {
    const setup = await this.#getSetupCheck()
    return localInferenceStatusSchema.parse({
      enabled: this.#enabled,
      device: {
        platform: this.#options.platform ?? process.platform,
        arch: this.#options.arch ?? process.arch,
        supported:
          (this.#options.platform ?? process.platform) === "darwin" &&
          (this.#options.arch ?? process.arch) === "arm64",
      },
      setup,
      active: this.#activeRequestId !== null,
    })
  }

  async suggest(rawRequest: LocalInferenceSuggestRequest): Promise<LocalInferenceSuggestResult> {
    const request = localInferenceSuggestRequestSchema.parse(rawRequest)
    if (!this.#enabled || this.#disposed) return this.#unavailable(request, "disabled")
    const setup = await this.#getSetupCheck()
    if (!this.#enabled || this.#disposed) return this.#unavailable(request, "disabled")
    if (setup.status !== "ready") return this.#unavailable(request, "unavailable")

    return new Promise((resolve) => {
      this.#stopPending()
      this.#pending = { request, manifest: setup.manifest, resolve }
      void this.#drain()
    })
  }

  cancel(requestId: string): void {
    if (this.#pending?.request.requestId === requestId) {
      const pending = this.#pending
      this.#pending = null
      pending.resolve(this.#unavailable(pending.request, "cancelled"))
    }
    if (this.#activeRequestId === requestId) {
      this.#cancelledActiveRequestId = requestId
      this.#options.engine.cancel(requestId)
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#stopPending()
    this.#cancelActive()
    this.#options.engine.dispose()
  }

  async #drain(): Promise<void> {
    if (this.#draining) return
    this.#draining = true
    try {
      while (this.#pending !== null) {
        const pending = this.#pending
        this.#pending = null
        let result: LocalInferenceSuggestResult
        try {
          result = await this.#run(pending.request, pending.manifest)
        } catch {
          result = this.#unavailable(pending.request, "execution_failed")
        }
        pending.resolve(result)
      }
    } finally {
      this.#draining = false
    }
  }

  async #run(
    request: LocalInferenceSuggestRequest,
    manifest: LocalInferenceSetupManifest,
  ): Promise<LocalInferenceSuggestResult> {
    this.#activeRequestId = request.requestId
    try {
      const suggestion = (await this.#options.engine.complete(request, manifest)).trim()
      if (this.#cancelledActiveRequestId === request.requestId) {
        return this.#unavailable(request, "cancelled")
      }
      if (suggestion.length === 0) return this.#unavailable(request, "execution_failed")
      return localInferenceSuggestResultSchema.parse({
        status: "ready",
        requestId: request.requestId,
        revision: request.revision,
        suggestions: [suggestion],
      })
    } catch {
      if (this.#cancelledActiveRequestId === request.requestId) {
        return this.#unavailable(request, "cancelled")
      }
      return this.#unavailable(request, "execution_failed")
    } finally {
      if (this.#activeRequestId === request.requestId) this.#activeRequestId = null
      if (this.#cancelledActiveRequestId === request.requestId) {
        this.#cancelledActiveRequestId = null
      }
    }
  }

  #stopPending(): void {
    if (this.#pending === null) return
    const pending = this.#pending
    this.#pending = null
    pending.resolve(this.#unavailable(pending.request, "cancelled"))
  }

  #cancelActive(): void {
    const requestId = this.#activeRequestId
    if (requestId === null) return
    this.#cancelledActiveRequestId = requestId
    this.#options.engine.cancel(requestId)
    this.#activeRequestId = null
  }

  async #getSetupCheck(): Promise<LocalInferenceSetupCheck> {
    if (this.#manifest === null) {
      return localInferenceSetupCheckSchema.parse({
        status: "unavailable",
        reason: "setup_required",
        message: "llama.cpp와 Qwen GGUF 파일을 선택하고 검증하세요.",
      })
    }
    if (this.#setupCheck === null) {
      this.#setupCheck = this.#options.checkSetup(this.#manifest)
    }
    return localInferenceSetupCheckSchema.parse(await this.#setupCheck)
  }

  #unavailable(
    request: LocalInferenceSuggestRequest,
    reason: "disabled" | "unavailable" | "execution_failed" | "cancelled",
  ): LocalInferenceSuggestResult {
    return localInferenceSuggestResultSchema.parse({
      status:
        reason === "disabled" ? "disabled" : reason === "cancelled" ? "cancelled" : "unavailable",
      requestId: request.requestId,
      revision: request.revision,
      reason,
    })
  }
}
