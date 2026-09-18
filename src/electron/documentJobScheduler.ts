import {
  type AiJobErrorCode,
  type AiJobId,
  type AiPool,
  type AiPriority,
  aiPolicy,
} from "../shared/documentAiJobs"
import type { DocumentId } from "../shared/schemas"

const priorityRank: Readonly<Record<AiPriority, number>> = {
  current: 0,
  adjacent: 1,
  prerequisite: 2,
  background: 3,
}

type JobState = "queued" | "running" | "completed" | "failed" | "cancelled"

export type SchedulerEvent =
  | { readonly kind: "queued"; readonly jobId: AiJobId }
  | { readonly kind: "started"; readonly jobId: AiJobId }
  | { readonly kind: "completed"; readonly jobId: AiJobId }
  | {
      readonly kind: "failed"
      readonly jobId: AiJobId
      readonly code: AiJobErrorCode
    }
  | { readonly kind: "cancelled"; readonly jobId: AiJobId }

export type SchedulerResult =
  | { readonly status: "completed"; readonly value: unknown }
  | { readonly status: "failed"; readonly code: AiJobErrorCode }
  | { readonly status: "cancelled" }

export type SchedulerJob = {
  readonly id: AiJobId
  readonly documentId: DocumentId
  readonly sourceGeneration: number
  readonly parents?: readonly AiJobId[]
  readonly priority: AiPriority
  readonly pool: AiPool
  readonly timeoutMs?: number
  readonly run: (signal: AbortSignal) => Promise<unknown>
}

export type SchedulerHandle = {
  readonly id: AiJobId
  readonly result: Promise<SchedulerResult>
  readonly cancel: () => void
}

export type SchedulerOptions = {
  readonly localConcurrency?: number
  readonly remoteConcurrency?: number
  readonly remoteVisionConcurrency?: number
  readonly remoteTextConcurrency?: number
  readonly queueCapacity?: number
  readonly onEvent?: (event: SchedulerEvent) => void
}

export class SchedulerRejectedError extends Error {
  readonly name = "SchedulerRejectedError"

  constructor(
    readonly code: "queue_full" | "scheduler_disposed" | "duplicate_job" | "unknown_dependency",
  ) {
    super(code)
  }
}

type Entry = SchedulerJob & {
  readonly state: { value: JobState }
  readonly controller: AbortController
  readonly resolve: (result: SchedulerResult) => void
  readonly result: Promise<SchedulerResult>
  terminal: boolean
  sequence: number
  timer?: ReturnType<typeof setTimeout>
}

export class DocumentJobScheduler {
  readonly #entries = new Map<AiJobId, Entry>()
  readonly #queue: Entry[] = []
  readonly #generations = new Map<DocumentId, number>()
  readonly #localLimit: number
  readonly #remoteLimit: number
  readonly #visionLimit: number
  readonly #textLimit: number
  readonly #queueCapacity: number
  readonly #onEvent: (event: SchedulerEvent) => void
  #activeLocal = 0
  #activeRemote = 0
  #activeVision = 0
  #activeText = 0
  #disposed = false

  constructor(options: SchedulerOptions = {}) {
    this.#localLimit = options.localConcurrency ?? 2
    this.#remoteLimit = Math.min(
      options.remoteConcurrency ?? aiPolicy.concurrentJobs,
      aiPolicy.concurrentJobs,
    )
    this.#visionLimit = Math.min(
      options.remoteVisionConcurrency ?? aiPolicy.concurrentVisionJobs,
      aiPolicy.concurrentVisionJobs,
    )
    this.#textLimit = Math.min(
      options.remoteTextConcurrency ?? aiPolicy.concurrentTextJobs,
      aiPolicy.concurrentTextJobs,
    )
    this.#queueCapacity = options.queueCapacity ?? 64
    this.#onEvent = options.onEvent ?? (() => undefined)
  }

  submit(job: SchedulerJob): SchedulerHandle {
    if (this.#disposed) throw new SchedulerRejectedError("scheduler_disposed")
    if (this.#entries.has(job.id)) throw new SchedulerRejectedError("duplicate_job")
    const parents = job.parents ?? []
    if (parents.some((parent) => !this.#entries.has(parent))) {
      throw new SchedulerRejectedError("unknown_dependency")
    }
    const generation = this.#generations.get(job.documentId)
    if (generation !== undefined && job.sourceGeneration < generation) {
      this.#onEvent({ kind: "cancelled", jobId: job.id })
      return {
        id: job.id,
        result: Promise.resolve({ status: "cancelled" }),
        cancel: () => undefined,
      }
    }
    if (this.#queue.length >= this.#queueCapacity) throw new SchedulerRejectedError("queue_full")
    let resolveResult: ((result: SchedulerResult) => void) | undefined
    const result = new Promise<SchedulerResult>((resolve) => {
      resolveResult = resolve
    })
    const entry: Entry = {
      ...job,
      state: { value: "queued" },
      controller: new AbortController(),
      resolve: (value) => resolveResult?.(value),
      result,
      terminal: false,
      sequence: this.#entries.size,
    }
    this.#entries.set(job.id, entry)
    this.#queue.push(entry)
    this.#onEvent({ kind: "queued", jobId: job.id })
    this.#pump()
    return { id: job.id, result, cancel: () => this.cancel(job.id) }
  }

  cancel(jobId: AiJobId): void {
    const entry = this.#entries.get(jobId)
    if (!entry || entry.terminal) return
    this.#cancelEntry(entry)
    this.#pump()
  }

  #cancelEntry(entry: Entry): void {
    const queueIndex = this.#queue.indexOf(entry)
    if (queueIndex >= 0) this.#queue.splice(queueIndex, 1)
    entry.controller.abort()
    this.#terminalize(entry, { status: "cancelled" })
  }

  setDocumentGeneration(documentId: DocumentId, generation: number): void {
    const previous = this.#generations.get(documentId) ?? 0
    this.#generations.set(documentId, Math.max(previous, generation))
    for (const entry of this.#entries.values()) {
      if (entry.documentId === documentId && entry.sourceGeneration < generation && !entry.terminal)
        this.#cancelEntry(entry)
    }
    this.#pump()
  }

  activeCount(pool: AiPool): number {
    if (pool === "local") return this.#activeLocal
    if (pool === "remote_vision") return this.#activeVision
    return this.#activeText
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const entry of this.#entries.values()) if (!entry.terminal) this.#cancelEntry(entry)
    this.#queue.length = 0
  }

  #pump(): void {
    let started = true
    while (started) {
      started = false
      for (const entry of [...this.#queue].sort(
        (left, right) =>
          priorityRank[left.priority] - priorityRank[right.priority] ||
          left.sequence - right.sequence,
      )) {
        if (entry.terminal || entry.state.value !== "queued") continue
        const dependency = this.#dependencyState(entry)
        if (dependency === "blocked") continue
        if (dependency === "failed") {
          this.#terminalize(entry, { status: "failed", code: "dependency_failed" })
          started = true
          continue
        }
        if (!this.#hasCapacity(entry.pool)) continue
        this.#start(entry)
        started = true
      }
    }
  }

  #dependencyState(entry: Entry): "ready" | "blocked" | "failed" {
    for (const parentId of entry.parents ?? []) {
      const parent = this.#entries.get(parentId)
      if (!parent || parent.state.value === "queued" || parent.state.value === "running")
        return "blocked"
      if (parent.state.value !== "completed") return "failed"
    }
    return "ready"
  }

  #hasCapacity(pool: AiPool): boolean {
    if (pool === "local") return this.#activeLocal < this.#localLimit
    if (this.#activeRemote >= this.#remoteLimit) return false
    return pool === "remote_vision"
      ? this.#activeVision < this.#visionLimit
      : this.#activeText < this.#textLimit
  }

  #start(entry: Entry): void {
    this.#queue.splice(this.#queue.indexOf(entry), 1)
    entry.state.value = "running"
    if (entry.pool === "local") this.#activeLocal += 1
    else {
      this.#activeRemote += 1
      if (entry.pool === "remote_vision") this.#activeVision += 1
      else this.#activeText += 1
    }
    this.#onEvent({ kind: "started", jobId: entry.id })
    const timeoutMs = entry.timeoutMs ?? (entry.pool === "remote_vision" ? 180_000 : 120_000)
    entry.timer = setTimeout(() => {
      entry.controller.abort()
      this.#terminalize(entry, { status: "failed", code: "timeout" })
      this.#pump()
    }, timeoutMs)
    void entry
      .run(entry.controller.signal)
      .then((value) => this.#terminalize(entry, { status: "completed", value }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return
        this.#terminalize(entry, { status: "failed", code: "provider_error" })
      })
      .finally(() => {
        this.#release(entry)
        this.#pump()
      })
  }

  #release(entry: Entry): void {
    if (entry.pool === "local") this.#activeLocal -= 1
    else {
      this.#activeRemote -= 1
      if (entry.pool === "remote_vision") this.#activeVision -= 1
      else this.#activeText -= 1
    }
  }

  #terminalize(entry: Entry, result: SchedulerResult): void {
    if (entry.terminal) return
    entry.terminal = true
    if (entry.timer) clearTimeout(entry.timer)
    entry.state.value = result.status
    entry.resolve(result)
    if (result.status === "completed") this.#onEvent({ kind: "completed", jobId: entry.id })
    else if (result.status === "cancelled") this.#onEvent({ kind: "cancelled", jobId: entry.id })
    else this.#onEvent({ kind: "failed", jobId: entry.id, code: result.code })
  }
}
