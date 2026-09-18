import type { ResearchJobId } from "../shared/researchJobSchemas"
import { ResearchRuntimeError } from "./researchJobRuntime"
import type { ResearchJobState } from "./researchJobState"
import type { ResearchJobStore } from "./researchJobStore"
import { WebDiscoveryError } from "./webDiscovery"
import { SourceFetchError } from "./webDiscoverySourceFetch"

export function shouldPauseSourceFetch(error: unknown): boolean {
  return error instanceof SourceFetchError && ["network", "dns", "timeout"].includes(error.kind)
}

export function stopResearchForError(
  store: ResearchJobStore,
  state: ResearchJobState,
  id: ResearchJobId,
  error: unknown,
): void {
  const pauseReason =
    error instanceof WebDiscoveryError && error.kind === "quota"
      ? "quota_reached"
      : error instanceof WebDiscoveryError && error.kind === "capability_unavailable"
        ? "search_unavailable"
        : error instanceof ResearchRuntimeError && error.kind === "authentication"
          ? "authentication_required"
          : error instanceof ResearchRuntimeError && error.kind === "quota"
            ? "quota_reached"
            : error instanceof ResearchRuntimeError && error.kind === "network"
              ? "network_lost"
              : shouldPauseSourceFetch(error)
                ? "network_lost"
                : null
  store.update(id, (job) =>
    state.stopped(job, {
      status: pauseReason === null ? "failed" : "paused",
      pauseReason,
      error: state.message(error),
    }),
  )
}
