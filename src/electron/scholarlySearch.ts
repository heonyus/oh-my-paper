import {
  type ScholarlyProvider,
  type ScholarlyProviderState,
  type ScholarlySearchItem,
  type ScholarlySearchRequest,
  type ScholarlySearchResult,
  type ScholarlySearchStep,
  scholarlySearchRequestSchema,
  scholarlySearchResultSchema,
} from "../shared/scholarlySearchSchemas"
import { type ProviderSearchOutcome, searchProvider } from "./scholarlySearchProviders"
import { defaultScholarlyTransport, type ScholarlyTransport } from "./scholarlySearchTransport"

export type { ScholarlyTransport } from "./scholarlySearchTransport"

type ScholarlySearchOptions = {
  readonly transport?: ScholarlyTransport
  readonly signal?: AbortSignal
  /** Called as each provider starts and finishes, then once when pages are merged. */
  readonly onStep?: (step: ScholarlySearchStep) => void
}

function providerStep(state: ScholarlyProviderState): ScholarlySearchStep {
  const base = {
    id: `provider-${state.provider}`,
    kind: "provider",
    provider: state.provider,
  } as const
  if (state.status === "success") {
    return {
      ...base,
      status: "done",
      found: state.resultCount,
      detail: state.freshness === "cached" ? "cached" : undefined,
    }
  }
  return { ...base, status: "failed", detail: state.error.kind }
}

function cancelledOutcome(provider: ScholarlyProvider): ProviderSearchOutcome {
  return {
    state: {
      provider,
      status: "error",
      error: { kind: "cancelled", httpStatus: null, retryAfterSeconds: null },
    },
    results: [],
  }
}

function mergeProviderPages(
  outcomes: readonly ProviderSearchOutcome[],
  limit: number,
): readonly ScholarlySearchItem[] {
  const merged: ScholarlySearchItem[] = []
  for (let index = 0; merged.length < limit; index += 1) {
    let added = false
    for (const outcome of outcomes) {
      const item = outcome.results[index]
      if (item && merged.length < limit) {
        merged.push(item)
        added = true
      }
    }
    if (!added) break
  }
  return merged
}

function resultStatus(states: readonly ScholarlyProviderState[]): ScholarlySearchResult["status"] {
  let successCount = 0
  let cancelledCount = 0
  for (const state of states) {
    switch (state.status) {
      case "success":
        successCount += 1
        break
      case "error":
        if (state.error.kind === "cancelled") cancelledCount += 1
        break
      default:
        throw new TypeError("Unexpected scholarly provider state")
    }
  }
  if (successCount === states.length) return "complete"
  if (successCount > 0) return "partial"
  if (cancelledCount === states.length) return "cancelled"
  return "failed"
}

export async function searchScholarly(
  input: ScholarlySearchRequest,
  options: ScholarlySearchOptions = {},
): Promise<ScholarlySearchResult> {
  const request = scholarlySearchRequestSchema.parse(input)
  const transport = options.transport ?? defaultScholarlyTransport
  const report = options.onStep ?? (() => {})
  const outcomes: ProviderSearchOutcome[] = []
  for (let index = 0; index < request.providers.length; index += 2) {
    const batch = request.providers.slice(index, index + 2)
    if (options.signal?.aborted) {
      const cancelled = request.providers.slice(index).map(cancelledOutcome)
      for (const outcome of cancelled) report(providerStep(outcome.state))
      outcomes.push(...cancelled)
      break
    }
    for (const provider of batch) {
      report({ id: `provider-${provider}`, kind: "provider", provider, status: "running" })
    }
    outcomes.push(
      ...(await Promise.all(
        batch.map(async (provider) => {
          const outcome = await searchProvider({
            provider,
            request,
            transport,
            signal: options.signal,
          })
          report(providerStep(outcome.state))
          return outcome
        }),
      )),
    )
  }
  const states = outcomes.map(({ state }) => state)
  const results = mergeProviderPages(outcomes, request.pageSize)
  report({ id: "merge", kind: "merge", status: "done", found: results.length })
  return scholarlySearchResultSchema.parse({
    status: resultStatus(states),
    query: request.query,
    page: request.page,
    pageSize: request.pageSize,
    results,
    providers: states,
  })
}
