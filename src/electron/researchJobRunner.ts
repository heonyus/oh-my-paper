import { randomUUID } from "node:crypto"
import type { ResearchJobId, ResearchJobSnapshot } from "../shared/researchJobSchemas"
import { researchSourceSchema } from "../shared/researchSourceSchemas"
import { shouldPauseSourceFetch, stopResearchForError } from "./researchJobErrors"
import {
  metadataSource,
  type ResearchRuntime,
  ResearchRuntimeError,
  researchModelResultSchema,
} from "./researchJobRuntime"
import { ResearchJobState } from "./researchJobState"
import type { ResearchJobStore } from "./researchJobStore"
import { buildResearchReport } from "./researchReport"

function canRefine(job: ResearchJobSnapshot): boolean {
  return (
    job.counts.searchRounds < job.input.budgets.searchRounds &&
    job.counts.sourcesAttempted < job.input.budgets.sources &&
    job.sources.length < 50
  )
}

export class ResearchJobRunner {
  private readonly state: ResearchJobState

  constructor(
    private readonly store: ResearchJobStore,
    private readonly runtime: ResearchRuntime,
    clock: () => string = () => new Date().toISOString(),
    idFactory: () => string = randomUUID,
  ) {
    this.state = new ResearchJobState(store, clock, idFactory)
  }

  async run(id: ResearchJobId, signal: AbortSignal): Promise<void> {
    try {
      await this.loadLocal(id, signal)
      while (this.store.require(id).status === "running") {
        await this.discover(id, signal)
        if (this.store.require(id).status !== "running") return
        const refined = await this.synthesize(id, signal)
        if (!refined) return
      }
    } catch (error) {
      if (signal.aborted) return
      stopResearchForError(this.store, this.state, id, error)
    }
  }

  private async loadLocal(id: ResearchJobId, signal: AbortSignal): Promise<void> {
    while (true) {
      const job = this.store.require(id)
      const sourceId = job.input.scope.localSourceIds[job.checkpoint.localSourceIndex]
      if (sourceId === undefined || job.status !== "running") return
      if (!this.state.canCall(job, "sourcesAttempted")) return
      const requestId = this.state.begin(id, "local_read", "loading_local", "sourcesAttempted")
      try {
        const source = researchSourceSchema.parse(
          await this.runtime.readLocalSource(sourceId, signal),
        )
        signal.throwIfAborted()
        this.store.update(id, (current) =>
          this.state.updated(current, {
            requests: this.state.complete(current, requestId, "succeeded"),
            sources: [...current.sources, source],
            counts: { ...current.counts, sourcesRetrieved: current.counts.sourcesRetrieved + 1 },
            checkpoint: {
              ...current.checkpoint,
              localSourceIndex: current.checkpoint.localSourceIndex + 1,
            },
          }),
        )
      } catch (error) {
        if (signal.aborted) throw error
        this.store.update(id, (current) =>
          this.state.updated(current, {
            requests: this.state.complete(current, requestId, "failed"),
            warnings: [...current.warnings, this.state.message(error)],
            checkpoint: {
              ...current.checkpoint,
              localSourceIndex: current.checkpoint.localSourceIndex + 1,
            },
          }),
        )
      }
    }
  }

  private async discover(id: ResearchJobId, signal: AbortSignal): Promise<void> {
    let job = this.store.require(id)
    if (job.input.scope.external && !job.checkpoint.searchComplete) {
      if (!this.state.canCall(job, "searchRounds")) {
        this.store.update(id, (current) =>
          this.state.updated(current, {
            checkpoint: { ...current.checkpoint, searchComplete: true },
          }),
        )
      } else {
        const sourceSlots = 50 - job.sources.length
        if (sourceSlots <= 0 || job.counts.sourcesAttempted >= job.input.budgets.sources) {
          this.store.update(id, (current) =>
            this.state.updated(current, {
              checkpoint: { ...current.checkpoint, searchComplete: true },
            }),
          )
          return
        }
        const requestId = this.state.begin(id, "search", "searching", "searchRounds")
        try {
          const response = await this.runtime.search(
            {
              query: job.nextQuery ?? job.input.question,
              maxResults: Math.min(
                job.input.budgets.sources - job.counts.sourcesAttempted,
                sourceSlots,
              ),
            },
            signal,
          )
          signal.throwIfAborted()
          this.store.update(id, (current) => {
            const known = new Set(current.sources.map((source) => source.url))
            const discovered = response.results
              .filter((source) => !known.has(source.url))
              .slice(0, sourceSlots)
            return this.state.updated(current, {
              requests: this.state.complete(
                current,
                requestId,
                "succeeded",
                response.providerRequestId,
              ),
              discoveredSources: discovered,
              sources: [...current.sources, ...discovered.map(metadataSource)],
              checkpoint: { ...current.checkpoint, searchComplete: true, nextSourceIndex: 0 },
            })
          })
        } catch (error) {
          if (signal.aborted) throw error
          this.state.failRequest(id, requestId)
          throw error
        }
      }
    }

    job = this.store.require(id)
    while (job.status === "running") {
      const candidate = job.discoveredSources[job.checkpoint.nextSourceIndex]
      if (candidate === undefined || !this.state.canCall(job, "sourcesAttempted")) return
      const requestId = this.state.begin(id, "source_fetch", "retrieving", "sourcesAttempted")
      try {
        const fetched = researchSourceSchema.parse(
          await this.runtime.fetchSource(candidate, signal),
        )
        signal.throwIfAborted()
        if (fetched.id !== candidate.sourceId || fetched.url !== candidate.url) {
          throw new ResearchRuntimeError(
            "invalid_response",
            "Retrieved source identity does not match the approved search result",
          )
        }
        this.store.update(id, (current) =>
          this.state.updated(current, {
            requests: this.state.complete(current, requestId, "succeeded"),
            sources: current.sources.map((source) => (source.id === fetched.id ? fetched : source)),
            counts: { ...current.counts, sourcesRetrieved: current.counts.sourcesRetrieved + 1 },
            checkpoint: {
              ...current.checkpoint,
              nextSourceIndex: current.checkpoint.nextSourceIndex + 1,
            },
          }),
        )
      } catch (error) {
        if (signal.aborted) throw error
        this.state.failRequest(id, requestId)
        if (shouldPauseSourceFetch(error)) throw error
        this.store.update(id, (current) =>
          this.state.updated(current, {
            warnings: [...current.warnings, this.state.message(error)],
            checkpoint: {
              ...current.checkpoint,
              nextSourceIndex: current.checkpoint.nextSourceIndex + 1,
            },
          }),
        )
      }
      job = this.store.require(id)
    }
  }

  private async synthesize(id: ResearchJobId, signal: AbortSignal): Promise<boolean> {
    const job = this.store.require(id)
    if (!this.state.canCall(job, "modelTurns")) {
      if (this.store.require(id).status === "running") {
        this.store.update(id, (current) =>
          this.state.stopped(current, { status: "paused", pauseReason: "budget_reached" }),
        )
      }
      return false
    }
    const requestId = this.state.begin(id, "model", "synthesizing", "modelTurns")
    try {
      const result = researchModelResultSchema.parse(
        await this.runtime.runModel(
          {
            question: job.input.question,
            sources: job.sources,
            allowedEvidenceIds: job.sources.map((source) => source.id),
            sourceContentIsUntrusted: true,
            allowRefine: canRefine(job),
          },
          signal,
        ),
      )
      signal.throwIfAborted()
      if (result.decision.kind === "refine") {
        if (!canRefine(job)) {
          throw new ResearchRuntimeError("invalid_response", "Model requested search beyond budget")
        }
        this.store.update(id, (current) =>
          this.state.updated(current, {
            requests: this.state.complete(current, requestId, "succeeded"),
            providerUsage: this.state.usage(current, result.inputTokens, result.outputTokens),
            nextQuery:
              result.decision.kind === "refine" ? result.decision.query : current.nextQuery,
            discoveredSources: [],
            checkpoint: { ...current.checkpoint, searchComplete: false, nextSourceIndex: 0 },
          }),
        )
        return true
      }
      const report = buildResearchReport(result.decision, job.sources)
      this.store.update(id, (current) =>
        this.state.stopped(current, {
          status: "completed",
          phase: "report_ready",
          requests: this.state.complete(current, requestId, "succeeded"),
          providerUsage: this.state.usage(current, result.inputTokens, result.outputTokens),
          report,
        }),
      )
      return false
    } catch (error) {
      if (signal.aborted) throw error
      this.state.failRequest(id, requestId)
      throw error
    }
  }
}
