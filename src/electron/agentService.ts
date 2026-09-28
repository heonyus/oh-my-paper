import {
  AGENT_PAPER_LIMIT,
  AGENT_QUERY_MAX,
  AGENT_SEARCH_RESULT_LIMIT,
  type AgentAskRequest,
  type AgentAskResult,
  type AgentContextDoc,
  type AgentMode,
  type AgentStep,
  agentAskRequestSchema,
  agentAskResultSchema,
  type ParsedAgentAskRequest,
} from "../shared/agentChat"
import type { DocumentId } from "../shared/ids"
import { type AnswerPaper, answerMessages, sanitizeCitations } from "./agentAnswer"
import type { AgentCompletion } from "./agentCompletion"
import { type PaperCandidate, toAgentPaper } from "./paperCandidates"
import { DiscoveryRun, type PaperDiscoverySources, type RoundLimits } from "./paperDiscovery"
import { type Judgment, judgeCandidates } from "./paperJudge"
import { planSearchBrief, type SearchBrief } from "./paperSearchBrief"

export type { AgentCompletion, AgentCompletionMessage } from "./agentCompletion"

export type AgentServiceDeps = {
  readonly complete: AgentCompletion
  readonly sources: PaperDiscoverySources
  readonly contextDocs: (
    ids: readonly DocumentId[],
  ) => readonly AgentContextDoc[] | Promise<readonly AgentContextDoc[]>
  readonly now?: () => Date
}

export type AgentStepListener = (step: AgentStep) => void

type ModeConfig = {
  readonly keywordQueries: number
  readonly semanticQueries: number
  readonly limits: RoundLimits
  readonly judgeBatch: number
  readonly rounds: number
  readonly seeds: number
  readonly papers: number
  /** Searching stops starting new rounds after this long; the answer is still written. */
  readonly searchBudgetMs: number
}

const modeConfig: Readonly<Record<AgentMode, ModeConfig>> = {
  quick: {
    keywordQueries: 3,
    semanticQueries: 1,
    limits: { semanticLimit: 25, keywordLimit: 10, expansionLimit: 0 },
    judgeBatch: 30,
    rounds: 1,
    seeds: 0,
    papers: AGENT_SEARCH_RESULT_LIMIT,
    searchBudgetMs: 60_000,
  },
  deep: {
    keywordQueries: AGENT_QUERY_MAX,
    semanticQueries: 2,
    limits: { semanticLimit: 40, keywordLimit: 15, expansionLimit: 30 },
    judgeBatch: 40,
    rounds: 3,
    seeds: 5,
    papers: AGENT_PAPER_LIMIT,
    searchBudgetMs: 240_000,
  },
}

function queryKey(query: string): string {
  return query.toLowerCase().replace(/\s+/gu, " ").trim()
}

function semanticQueriesFor(brief: SearchBrief, config: ModeConfig): readonly string[] {
  return [brief.semanticQuery, ...brief.criteria].slice(0, config.semanticQueries)
}

type Ranked = { readonly id: string; readonly judgment: Judgment }

function rankedJudgments(
  judgments: ReadonlyMap<string, Judgment>,
  run: DiscoveryRun,
  minScore: number,
): readonly Ranked[] {
  return [...judgments]
    .filter(([, judgment]) => judgment.score >= minScore)
    .map(([id, judgment]) => ({ id, judgment }))
    .sort(
      (left, right) =>
        right.judgment.score - left.judgment.score || run.rankOf(right.id) - run.rankOf(left.id),
    )
}

async function discover(
  request: ParsedAgentAskRequest,
  brief: SearchBrief,
  deps: AgentServiceDeps,
  onStep: AgentStepListener,
  signal: AbortSignal | undefined,
): Promise<{
  readonly run: DiscoveryRun
  readonly judgments: Map<string, Judgment>
  readonly byModel: boolean
}> {
  const config = modeConfig[request.mode]
  const startedAt = Date.now()
  const run = new DiscoveryRun(deps.sources, onStep, signal)
  const window = { yearFrom: brief.yearFrom, yearTo: brief.yearTo }
  const judgments = new Map<string, Judgment>()
  const expanded = new Set<string>()
  const ranQueries = new Set<string>()
  let byModel = true
  let queries = brief.queries.slice(0, config.keywordQueries)
  for (let round = 1; round <= config.rounds; round += 1) {
    if (round > 1) {
      const seeds = rankedJudgments(judgments, run, 2)
        .filter(({ id }) => !expanded.has(id))
        .slice(0, config.seeds)
      for (const { id } of seeds) expanded.add(id)
      const candidates = seeds
        .map(({ id }) => run.pool.get(id))
        .filter((seed): seed is PaperCandidate => seed !== undefined)
      if (candidates.length > 0) await run.expand(round, candidates, window, config.limits)
    }
    for (const query of queries) ranQueries.add(queryKey(query))
    await run.searchRound(
      round,
      queries,
      round === 1 ? semanticQueriesFor(brief, config) : [],
      window,
      config.limits,
    )
    const batch = run.unjudged(new Set(judgments.keys()), config.judgeBatch)
    if (batch.length === 0) break
    const judgeId = `judge:${round}`
    onStep({ id: judgeId, kind: "judge", status: "running", found: batch.length })
    const outcome = await judgeCandidates(
      {
        question: request.question,
        brief: { ...brief, queries: [...ranQueries] },
        candidates: batch,
        wantsNextQueries: round < config.rounds,
      },
      deps.complete,
      signal,
    )
    byModel &&= outcome.judgedByModel
    for (const [id, judgment] of outcome.judgments) judgments.set(id, judgment)
    const newRelevant = batch.filter(([id]) => (judgments.get(id)?.score ?? 0) >= 2).length
    onStep({
      id: judgeId,
      kind: "judge",
      status: "done",
      found: newRelevant,
      detail: `후보 ${batch.length}편 중 ${newRelevant}편 관련${outcome.judgedByModel ? "" : " · 키워드 일치로 판정"}`,
    })
    queries = outcome.nextQueries.filter((query) => !ranQueries.has(queryKey(query))).slice(0, 3)
    if (Date.now() - startedAt > config.searchBudgetMs) break
    if (round > 1 && newRelevant < 2 && queries.length === 0) break
  }
  return { run, judgments, byModel }
}

export async function askAgent(
  value: AgentAskRequest,
  deps: AgentServiceDeps,
  onStep: AgentStepListener = () => {},
  signal?: AbortSignal,
): Promise<AgentAskResult> {
  const request = agentAskRequestSchema.parse(value)
  const config = modeConfig[request.mode]
  const contextDocs = await deps.contextDocs(request.contextDocIds)
  if (contextDocs.length > 0) {
    onStep({ id: "context", kind: "context", status: "done", found: contextDocs.length })
  }
  onStep({ id: "plan", kind: "plan", status: "running" })
  const { brief, planned } = await planSearchBrief(
    { ...request, contextDocs, today: deps.now?.() ?? new Date() },
    deps.complete,
    signal,
  )
  onStep({
    id: "plan",
    kind: "plan",
    status: planned ? "done" : "failed",
    queries: brief.queries.slice(0, Math.min(config.keywordQueries, AGENT_QUERY_MAX)),
    ...(brief.interpretation ? { detail: brief.interpretation.slice(0, 500) } : {}),
  })
  const { run, judgments, byModel } = await discover(request, brief, deps, onStep, signal)
  const relevant = rankedJudgments(judgments, run, 2)
  const chosen = relevant.length > 0 ? relevant : rankedJudgments(judgments, run, 1).slice(0, 3)
  const papers: AnswerPaper[] = chosen.slice(0, config.papers).flatMap(({ id, judgment }) => {
    const candidate = run.pool.get(id)
    return candidate
      ? [{ paper: toAgentPaper(candidate, judgment), abstract: candidate.abstract }]
      : []
  })
  const searchNote = [
    `${run.pool.size} candidates found, ${judgments.size} screened, ${relevant.length} relevant`,
    relevant.length === 0 && papers.length > 0 ? "only weakly related papers are listed" : "",
    byModel ? "" : "relevance was estimated from keyword overlap because the model screen failed",
  ]
    .filter((part) => part !== "")
    .join("; ")
  onStep({ id: "compose", kind: "compose", status: "running" })
  const completion = await deps.complete(
    answerMessages({ ...request, brief, contextDocs, papers, searchNote }),
    { signal },
  )
  onStep({ id: "compose", kind: "compose", status: "done", detail: completion.model })
  return agentAskResultSchema.parse({
    answer:
      sanitizeCitations(completion.text, papers.length, contextDocs.length).slice(0, 32_000) ||
      "답변을 만들지 못했습니다.",
    model: completion.model,
    papers: papers.map(({ paper }) => paper),
  })
}
