import { randomUUID } from "node:crypto"
import {
  type ResearchJobId,
  type ResearchJobPhase,
  type ResearchJobSnapshot,
  researchJobSnapshotSchema,
} from "../shared/researchJobSchemas"
import { researchRequestIdSchema } from "../shared/researchSourceSchemas"
import type { ResearchJobStore } from "./researchJobStore"

type CountKey = "searchRounds" | "sourcesAttempted" | "modelTurns"
type RequestKind = "local_read" | "search" | "source_fetch" | "model"

export class ResearchJobState {
  constructor(
    private readonly store: ResearchJobStore,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = randomUUID,
  ) {}

  begin(id: ResearchJobId, kind: RequestKind, phase: ResearchJobPhase, count: CountKey) {
    const requestId = researchRequestIdSchema.parse(this.idFactory())
    this.store.update(id, (job) =>
      this.updated(job, {
        phase,
        counts: { ...job.counts, [count]: job.counts[count] + 1 },
        requests: [
          ...job.requests,
          {
            id: requestId,
            kind,
            state: "pending",
            providerRequestId: null,
            startedAt: this.clock(),
            completedAt: null,
          },
        ],
      }),
    )
    return requestId
  }

  complete(
    job: ResearchJobSnapshot,
    id: string,
    state: "succeeded" | "failed",
    providerRequestId: string | null = null,
  ) {
    return job.requests.map((request) =>
      request.id === id
        ? { ...request, state, providerRequestId, completedAt: this.clock() }
        : request,
    )
  }

  failRequest(id: ResearchJobId, requestId: string): void {
    this.store.update(id, (job) =>
      this.updated(job, { requests: this.complete(job, requestId, "failed") }),
    )
  }

  canCall(job: ResearchJobSnapshot, count: CountKey): boolean {
    if (job.status !== "running") return false
    const maximum =
      count === "sourcesAttempted" ? job.input.budgets.sources : job.input.budgets[count]
    if (job.counts[count] >= maximum) return false
    const active =
      job.activeSince === null ? 0 : Date.parse(this.clock()) - Date.parse(job.activeSince)
    if (job.elapsedMs + active < job.input.budgets.minutes * 60_000) return true
    this.store.update(job.id, (current) =>
      this.stopped(current, { status: "paused", pauseReason: "time_reached" }),
    )
    return false
  }

  usage(
    job: ResearchJobSnapshot,
    input: number | null,
    output: number | null,
  ): ResearchJobSnapshot["providerUsage"] {
    if (input === null || output === null) return { state: "unknown" }
    const previous = job.providerUsage.state === "reported" ? job.providerUsage : null
    return {
      state: "reported",
      inputTokens: (previous?.inputTokens ?? 0) + input,
      outputTokens: (previous?.outputTokens ?? 0) + output,
    }
  }

  message(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 2_000) : "Research operation failed"
  }

  updated(job: ResearchJobSnapshot, changes: object): ResearchJobSnapshot {
    return researchJobSnapshotSchema.parse({ ...job, ...changes, updatedAt: this.clock() })
  }

  stopped(job: ResearchJobSnapshot, changes: object): ResearchJobSnapshot {
    const active =
      job.activeSince === null ? 0 : Date.parse(this.clock()) - Date.parse(job.activeSince)
    return this.updated(job, {
      ...changes,
      elapsedMs: Math.max(0, job.elapsedMs + active),
      activeSince: null,
    })
  }
}
