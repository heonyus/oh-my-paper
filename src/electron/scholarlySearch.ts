import {
  type ScholarlyProvider,
  type ScholarlyProviderState,
  type ScholarlySearchItem,
  type ScholarlySearchRequest,
  type ScholarlySearchResult,
  scholarlySearchRequestSchema,
  scholarlySearchResultSchema,
} from "../shared/scholarlySearchSchemas"
import { type ProviderSearchOutcome, searchProvider } from "./scholarlySearchProviders"
import { defaultScholarlyTransport, type ScholarlyTransport } from "./scholarlySearchTransport"

export type { ScholarlyTransport } from "./scholarlySearchTransport"

type ScholarlySearchOptions = {
  readonly transport?: ScholarlyTransport
  readonly signal?: AbortSignal
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
  const outcomes: ProviderSearchOutcome[] = []
  for (let index = 0; index < request.providers.length; index += 2) {
    const batch = request.providers.slice(index, index + 2)
    if (options.signal?.aborted) {
      outcomes.push(...request.providers.slice(index).map(cancelledOutcome))
      break
    }
    outcomes.push(
      ...(await Promise.all(
        batch.map((provider) =>
          searchProvider({ provider, request, transport, signal: options.signal }),
        ),
      )),
    )
  }
  const states = outcomes.map(({ state }) => state)
  return scholarlySearchResultSchema.parse({
    status: resultStatus(states),
    query: request.query,
    page: request.page,
    pageSize: request.pageSize,
    results: mergeProviderPages(outcomes, request.pageSize),
    providers: states,
  })
}
