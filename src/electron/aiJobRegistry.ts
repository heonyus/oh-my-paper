import type { AiJobErrorCode, AiJobEvent, AiJobId, AiRole } from "../shared/documentAiJobs"
import { ProviderConfigurationError } from "./providerConfigStore"

export type ProviderCompletionResult = {
  readonly text: string
  readonly model: string
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly estimatedCostUsd: number | null
}

function property(error: object, name: string): unknown {
  return name in error ? Reflect.get(error, name) : undefined
}

function statusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null
  const value = property(error, "statusCode") ?? property(error, "status")
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

function aiErrorCode(error: unknown): AiJobErrorCode {
  if (error instanceof ProviderConfigurationError) {
    if (error.kind === "auth") return "auth"
    if (error.kind === "rate_limited") return "rate_limited"
    if (error.kind === "timeout") return "timeout"
    if (error.kind === "cancelled") return "cancelled"
    if (error.message.includes("cancel")) return "cancelled"
  }
  if (error instanceof Error && error.name === "AbortError") return "cancelled"
  const status = statusCode(error)
  if (status === 401 || status === 403) return "auth"
  if (status === 408 || status === 504) return "timeout"
  if (status === 429) return "rate_limited"
  if (error instanceof Error && /(?:abort|cancel)/iu.test(error.message)) return "cancelled"
  if (error instanceof Error && /(?:timeout|timed out)/iu.test(error.message)) return "timeout"
  return "provider_error"
}

export type AiRegistryEvent =
  | { readonly kind: "started"; readonly jobId: AiJobId; readonly sequence: number }
  | {
      readonly kind: "delta"
      readonly jobId: AiJobId
      readonly sequence: number
      readonly delta: string
    }
  | {
      readonly kind: "completed"
      readonly jobId: AiJobId
      readonly sequence: number
      readonly result: ProviderCompletionResult
    }
  | {
      readonly kind: "failed"
      readonly jobId: AiJobId
      readonly sequence: number
      readonly code: AiJobErrorCode
    }
  | { readonly kind: "cancelled"; readonly jobId: AiJobId; readonly sequence: number }

export type AiRegistryJob = {
  readonly id: AiJobId
  readonly role: AiRole
  readonly timeoutMs?: number
  readonly run: (
    signal: AbortSignal,
    onDelta: (delta: string) => void,
  ) => Promise<ProviderCompletionResult>
}

export type AiRegistryResult =
  | { readonly status: "completed"; readonly result: ProviderCompletionResult }
  | { readonly status: "failed"; readonly code: AiJobErrorCode }
  | { readonly status: "cancelled" }

export type AiRegistryHandle = {
  readonly id: AiJobId
  readonly result: Promise<AiRegistryResult>
}

type ActiveJob = AiRegistryJob & {
  readonly controller: AbortController
  readonly resolve: (result: AiRegistryResult) => void
  terminal: boolean
  sequence: number
  timer?: ReturnType<typeof setTimeout>
}

export class AiJobRegistry {
  readonly #active = new Map<AiJobId, ActiveJob>()
  readonly #emit: (event: AiRegistryEvent) => void
  #disposed = false

  constructor(emit: (event: AiRegistryEvent) => void) {
    this.#emit = emit
  }

  start(job: AiRegistryJob): AiRegistryHandle {
    if (this.#disposed || this.#active.has(job.id))
      return this.failedHandle(job.id, "provider_error")
    let resolveResult: ((result: AiRegistryResult) => void) | undefined
    const result = new Promise<AiRegistryResult>((resolve) => {
      resolveResult = resolve
    })
    const active: ActiveJob = {
      ...job,
      controller: new AbortController(),
      resolve: (value) => resolveResult?.(value),
      terminal: false,
      sequence: 0,
    }
    this.#active.set(job.id, active)
    this.#emit({ kind: "started", jobId: job.id, sequence: active.sequence })
    const timeout = job.timeoutMs ?? 120_000
    active.timer = setTimeout(() => {
      active.controller.abort()
      this.#finish(active, { status: "failed", code: "timeout" })
    }, timeout)
    const onDelta = (delta: string): void => {
      if (!active.terminal && !active.controller.signal.aborted) {
        active.sequence += 1
        this.#emit({ kind: "delta", jobId: job.id, sequence: active.sequence, delta })
      }
    }
    void Promise.resolve()
      .then(() => job.run(active.controller.signal, onDelta))
      .then((completion) => this.#finish(active, { status: "completed", result: completion }))
      .catch((error: unknown) => {
        const code = aiErrorCode(error)
        if (code === "cancelled") this.#finish(active, { status: "cancelled" })
        else this.#finish(active, { status: "failed", code })
      })
    return { id: job.id, result }
  }

  cancel(id: AiJobId): void {
    const active = this.#active.get(id)
    if (!active || active.terminal) return
    active.controller.abort()
    this.#finish(active, { status: "cancelled" })
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const id of this.#active.keys()) this.cancel(id)
  }

  #finish(active: ActiveJob, result: AiRegistryResult): void {
    if (active.terminal) return
    active.terminal = true
    if (active.timer) clearTimeout(active.timer)
    active.resolve(result)
    this.#active.delete(active.id)
    active.sequence += 1
    if (result.status === "completed")
      this.#emit({
        kind: "completed",
        jobId: active.id,
        sequence: active.sequence,
        result: result.result,
      })
    else if (result.status === "cancelled")
      this.#emit({ kind: "cancelled", jobId: active.id, sequence: active.sequence })
    else
      this.#emit({ kind: "failed", jobId: active.id, sequence: active.sequence, code: result.code })
  }

  failedHandle(id: AiJobId, code: AiJobErrorCode): AiRegistryHandle {
    const result = Promise.resolve<AiRegistryResult>({ status: "failed", code })
    return { id, result }
  }
}

export function publicAiJobEvent(event: AiRegistryEvent): AiJobEvent {
  switch (event.kind) {
    case "started":
      return { kind: "started", jobId: event.jobId, sequence: event.sequence }
    case "delta":
      return {
        kind: "delta",
        jobId: event.jobId,
        sequence: event.sequence,
        contentLength: event.delta.length,
        delta: event.delta,
      }
    case "completed": {
      const usageTokens =
        event.result.inputTokens === null || event.result.outputTokens === null
          ? null
          : event.result.inputTokens + event.result.outputTokens
      return {
        kind: "completed",
        jobId: event.jobId,
        sequence: event.sequence,
        usageTokens,
        model: event.result.model,
        text: event.result.text,
      }
    }
    case "failed":
      return {
        kind: "failed",
        jobId: event.jobId,
        sequence: event.sequence,
        code: event.code,
        retryable: false,
      }
    case "cancelled":
      return { kind: "cancelled", jobId: event.jobId, sequence: event.sequence }
    default: {
      const exhaustive: never = event
      return exhaustive
    }
  }
}
