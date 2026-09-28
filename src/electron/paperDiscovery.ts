import type { AgentStep } from "../shared/agentChat"
import { CandidatePool, type PaperCandidate } from "./paperCandidates"
import { PaperSourceError } from "./paperSourceHttp"

export type SearchWindow = { readonly yearFrom: number | null; readonly yearTo: number | null }

type SearchInput = SearchWindow & { readonly query: string; readonly limit: number }

export type PaperSearchFunction = (
  input: SearchInput,
  signal?: AbortSignal,
) => Promise<readonly PaperCandidate[]>

/** Every external lookup the research agent may use; injected so tests stay offline. */
export type PaperDiscoverySources = {
  readonly semantic: { readonly label: string; readonly search: PaperSearchFunction }
  readonly keyword: readonly { readonly label: string; readonly search: PaperSearchFunction }[]
  readonly recommendations: (
    seeds: readonly PaperCandidate[],
    limit: number,
    signal?: AbortSignal,
  ) => Promise<readonly PaperCandidate[]>
  readonly references: (
    seed: PaperCandidate,
    limit: number,
    signal?: AbortSignal,
  ) => Promise<readonly PaperCandidate[]>
  readonly citing: (
    seed: PaperCandidate,
    limit: number,
    signal?: AbortSignal,
  ) => Promise<readonly PaperCandidate[]>
}

export type RoundLimits = {
  readonly semanticLimit: number
  readonly keywordLimit: number
  readonly expansionLimit: number
}

type Lookup = { readonly label: string; readonly run: () => Promise<readonly PaperCandidate[]> }

type LookupOutcome = {
  readonly label: string
  readonly found: number | null
  readonly added: number
  readonly note: string | null
}

function failureLabel(error: unknown): string {
  if (!(error instanceof PaperSourceError)) return "실패"
  switch (error.kind) {
    case "rate_limited":
      return "요청 한도 초과"
    case "http_error":
      return error.httpStatus === null ? "서버 오류" : `서버 오류 ${error.httpStatus}`
    case "network":
      return "연결 실패"
    case "malformed":
      return "응답 형식 오류"
  }
}

function serialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return (task) => {
    const run = tail.then(task)
    tail = run.catch(() => undefined)
    return run
  }
}

/**
 * One research run: pools candidates across rounds, keeps a fused rank per paper, and reports
 * each lookup as a step. A source that rate-limits is skipped for the rest of the run.
 */
export class DiscoveryRun {
  readonly pool = new CandidatePool()
  readonly #rank = new Map<string, number>()
  readonly #blocked = new Set<string>()
  readonly #queues = new Map<string, <T>(task: () => Promise<T>) => Promise<T>>()

  constructor(
    readonly sources: PaperDiscoverySources,
    readonly onStep: (step: AgentStep) => void,
    readonly signal?: AbortSignal,
  ) {}

  rankOf(id: string): number {
    return this.#rank.get(id) ?? 0
  }

  #addRanked(candidates: readonly PaperCandidate[], weight: number, window?: SearchWindow): number {
    const kept = candidates.filter(
      (candidate) =>
        !window ||
        candidate.year === null ||
        ((window.yearFrom === null || candidate.year >= window.yearFrom) &&
          (window.yearTo === null || candidate.year <= window.yearTo)),
    )
    const added = this.pool.add(kept)
    kept.forEach((candidate, index) => {
      const id = this.pool.idOf(candidate)
      if (id) this.#rank.set(id, this.rankOf(id) + weight / (8 + index))
    })
    return added.length
  }

  #queue(label: string): <T>(task: () => Promise<T>) => Promise<T> {
    const existing = this.#queues.get(label)
    if (existing) return existing
    const created = serialQueue()
    this.#queues.set(label, created)
    return created
  }

  async #runLookups(
    stepBase: Omit<AgentStep, "status">,
    lookups: readonly Lookup[],
    weight: number,
    window?: SearchWindow,
  ): Promise<number> {
    this.onStep({ ...stepBase, status: "running" })
    const outcomes = await Promise.all(
      lookups.map((lookup) =>
        this.#queue(lookup.label)(async (): Promise<LookupOutcome> => {
          const skipped = { label: lookup.label, found: null, added: 0 }
          if (this.#blocked.has(lookup.label)) return { ...skipped, note: "건너뜀" }
          try {
            const found = await lookup.run()
            const added = this.#addRanked(found, weight, window)
            return { label: lookup.label, found: found.length, added, note: null }
          } catch (error) {
            if (this.signal?.aborted) throw error
            if (error instanceof PaperSourceError && error.kind === "rate_limited") {
              this.#blocked.add(lookup.label)
            }
            return { ...skipped, note: failureLabel(error) }
          }
        }),
      ),
    )
    const added = outcomes.reduce((sum, outcome) => sum + outcome.added, 0)
    this.onStep({
      ...stepBase,
      status: outcomes.every((outcome) => outcome.found === null) ? "failed" : "done",
      found: added,
      detail: outcomes
        .map((outcome) => `${outcome.label} ${outcome.found ?? outcome.note ?? ""}`)
        .join(" · ")
        .slice(0, 500),
    })
    return added
  }

  /** Runs every query against every keyword source plus the semantic queries; returns new papers. */
  async searchRound(
    round: number,
    queries: readonly string[],
    semanticQueries: readonly string[],
    window: SearchWindow,
    limits: RoundLimits,
  ): Promise<number> {
    const semantic = semanticQueries.map((query, index) =>
      this.#runLookups(
        { id: `search:${round}:s${index}`, kind: "search", query: query.slice(0, 300) },
        [
          {
            label: this.sources.semantic.label,
            run: () =>
              this.sources.semantic.search(
                { ...window, query, limit: limits.semanticLimit },
                this.signal,
              ),
          },
        ],
        1.2,
      ),
    )
    const keyword = queries.map((query, index) =>
      this.#runLookups(
        { id: `search:${round}:${index}`, kind: "search", query: query.slice(0, 300) },
        this.sources.keyword.map((source) => ({
          label: source.label,
          run: () => source.search({ ...window, query, limit: limits.keywordLimit }, this.signal),
        })),
        1,
      ),
    )
    const counts = await Promise.all([...semantic, ...keyword])
    return counts.reduce((sum, count) => sum + count, 0)
  }

  /** Follows recommendations, references and citing papers of the best papers so far. */
  expand(
    round: number,
    seeds: readonly PaperCandidate[],
    window: SearchWindow,
    limits: RoundLimits,
  ): Promise<number> {
    const [first, second] = seeds
    const lookups: Lookup[] = [
      {
        label: "추천",
        run: () => this.sources.recommendations(seeds, limits.expansionLimit, this.signal),
      },
      ...[first, second]
        .filter((seed): seed is PaperCandidate => seed !== undefined)
        .flatMap((seed) => [
          {
            label: "참고문헌",
            run: () => this.sources.references(seed, limits.expansionLimit, this.signal),
          },
          {
            label: "피인용",
            run: () => this.sources.citing(seed, limits.expansionLimit, this.signal),
          },
        ]),
    ]
    return this.#runLookups({ id: `expand:${round}`, kind: "expand" }, lookups, 0.6, window)
  }

  /** The highest-ranked pooled papers that have not been judged yet. */
  unjudged(judged: ReadonlySet<string>, limit: number): readonly [string, PaperCandidate][] {
    return this.pool
      .entries()
      .filter(([id]) => !judged.has(id))
      .sort(([left], [right]) => this.rankOf(right) - this.rankOf(left))
      .slice(0, limit)
  }
}
