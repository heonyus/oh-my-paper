import type {
  ResearchJobId,
  ResearchJobSnapshot,
  ResearchPreviewInput,
} from "../shared/researchJobSchemas"
import { researchJobIdSchema, researchJobSnapshotSchema } from "../shared/researchJobSchemas"
import { ResearchJobRunner } from "./researchJobRunner"
import type { ResearchRuntime } from "./researchJobRuntime"
import type { ResearchJobStore } from "./researchJobStore"
import type { ResearchNoteCreator } from "./researchReport"
import { saveResearchReport } from "./researchReportSave"

type ActiveJob = {
  readonly controller: AbortController
  readonly completion: Promise<void>
  readonly timer: ReturnType<typeof setTimeout>
}

export class ResearchJobs {
  private readonly active = new Map<ResearchJobId, ActiveJob>()
  private readonly pendingSaves = new Set<Promise<ResearchJobSnapshot>>()
  private readonly runner: ResearchJobRunner
  private closing = false

  constructor(
    private readonly store: ResearchJobStore,
    runtime: ResearchRuntime,
    private readonly createNode: ResearchNoteCreator,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {
    this.runner = new ResearchJobRunner(store, runtime, clock)
  }

  preview(input: ResearchPreviewInput): ResearchJobSnapshot {
    this.requireOpen()
    return this.store.create(input)
  }

  list(): readonly ResearchJobSnapshot[] {
    return this.store.list()
  }

  status(rawId: string): ResearchJobSnapshot | null {
    return this.store.get(researchJobIdSchema.parse(rawId))
  }

  start(rawId: string): ResearchJobSnapshot {
    this.requireOpen()
    const id = researchJobIdSchema.parse(rawId)
    const job = this.store.require(id)
    if (job.status !== "awaiting_start") throw new Error("Only a previewed job can be started")
    return this.launch(id, job)
  }

  resume(rawId: string): ResearchJobSnapshot {
    this.requireOpen()
    const id = researchJobIdSchema.parse(rawId)
    const job = this.store.require(id)
    if (job.status !== "paused") throw new Error("Only a paused job can be resumed")
    if (
      job.phase === "report_ready" &&
      job.report !== null &&
      job.pauseReason === "restart_unknown_outcome"
    ) {
      return this.store.update(id, (current) =>
        researchJobSnapshotSchema.parse({
          ...current,
          status: "completed",
          pauseReason: null,
          error: null,
          updatedAt: this.clock(),
        }),
      )
    }
    return this.launch(id, job)
  }

  cancel(rawId: string): ResearchJobSnapshot {
    const id = researchJobIdSchema.parse(rawId)
    this.active.get(id)?.controller.abort()
    const now = this.clock()
    return this.store.update(id, (job) => {
      if (job.status !== "running") return job
      const active = job.activeSince === null ? 0 : Date.parse(now) - Date.parse(job.activeSince)
      return researchJobSnapshotSchema.parse({
        ...job,
        status: "cancelled",
        pauseReason: null,
        error: null,
        requests: job.requests.map((request) =>
          request.state === "pending" ? { ...request, state: "failed", completedAt: now } : request,
        ),
        elapsedMs: Math.max(0, job.elapsedMs + active),
        activeSince: null,
        updatedAt: now,
      })
    })
  }

  async saveReport(raw: {
    readonly jobId: string
    readonly title: string
    readonly markdown: string
  }): Promise<ResearchJobSnapshot> {
    this.requireOpen()
    const operation = saveResearchReport(this.store, this.createNode, this.clock, raw)
    this.pendingSaves.add(operation)
    try {
      return await operation
    } finally {
      this.pendingSaves.delete(operation)
    }
  }

  async wait(rawId: string): Promise<ResearchJobSnapshot> {
    const id = researchJobIdSchema.parse(rawId)
    await this.active.get(id)?.completion
    return this.store.require(id)
  }

  async dispose(): Promise<void> {
    this.closing = true
    const completions = [...this.active.values()].map((active) => {
      clearTimeout(active.timer)
      active.controller.abort()
      return active.completion
    })
    await Promise.allSettled([...completions, ...this.pendingSaves])
    this.active.clear()
  }

  private launch(id: ResearchJobId, job: ResearchJobSnapshot): ResearchJobSnapshot {
    if (this.active.has(id)) throw new Error("Research job is already active")
    // ponytail: serialize subscription research; add a measured queue only if parallel jobs are needed.
    if (this.active.size >= 1) throw new Error("Another research job is already active")
    const now = this.clock()
    const running = this.store.save(
      researchJobSnapshotSchema.parse({
        ...job,
        status: "running",
        phase: job.phase === "preview" ? "loading_local" : job.phase,
        pauseReason: null,
        error: null,
        activeSince: now,
        startedAt: job.startedAt ?? now,
        updatedAt: now,
      }),
    )
    const controller = new AbortController()
    const remainingMs = Math.max(1, job.input.budgets.minutes * 60_000 - job.elapsedMs)
    const timer = setTimeout(() => this.pauseForTime(id, controller), remainingMs)
    const completion = this.runner.run(id, controller.signal).finally(() => {
      clearTimeout(timer)
      this.active.delete(id)
    })
    this.active.set(id, { controller, completion, timer })
    return running
  }

  private pauseForTime(id: ResearchJobId, controller: AbortController): void {
    controller.abort()
    const now = this.clock()
    this.store.update(id, (job) =>
      job.status !== "running"
        ? job
        : researchJobSnapshotSchema.parse({
            ...job,
            status: "paused",
            pauseReason: "time_reached",
            requests: job.requests.map((request) =>
              request.state === "pending"
                ? { ...request, state: "failed", completedAt: now }
                : request,
            ),
            elapsedMs: job.input.budgets.minutes * 60_000,
            activeSince: null,
            updatedAt: now,
          }),
    )
  }

  private requireOpen(): void {
    if (this.closing) throw new Error("Research jobs are shutting down")
  }
}
