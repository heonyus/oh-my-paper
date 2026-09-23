import {
  AGENT_QUERY_MAX,
  AGENT_SEARCH_RESULT_LIMIT,
  AGENT_SYSTEM_PROMPT,
  type AgentAskRequest,
  type AgentAskResult,
  type AgentContextDoc,
  type AgentStep,
  agentAskRequestSchema,
  agentAskResultSchema,
  agentPlanSchema,
  buildAgentUserPrompt,
} from "../shared/agentChat"
import type { DocumentId } from "../shared/ids"
import type { ScholarlySearchItem, ScholarlySearchResult } from "../shared/scholarlySearchSchemas"
import type { AgentSearchHit } from "./semanticScholarSearch"

export type AgentCompletionMessage = {
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

export type AgentCompletion = (
  messages: readonly AgentCompletionMessage[],
) => Promise<{ readonly text: string; readonly model: string }>

export type AgentServiceDeps = {
  readonly plan: (question: string) => Promise<readonly string[]>
  readonly paperSearch: (query: string) => Promise<readonly AgentSearchHit[]>
  readonly search: (input: {
    readonly query: string
  }) => Promise<Pick<ScholarlySearchResult, "status" | "results">>
  readonly complete: AgentCompletion
  readonly contextDocs: (
    ids: readonly DocumentId[],
  ) => readonly AgentContextDoc[] | Promise<readonly AgentContextDoc[]>
}

const AGENT_PLANNER_PROMPT = [
  "You rewrite a research question into scholarly search queries for a paper-search API.",
  'Return ONLY JSON: {"queries": ["..."]} with 1-3 queries.',
  "- Write queries in English even if the question is in another language.",
  "- Use concrete academic terminology (method names, task names, model names).",
  "- If the question is ambiguous, cover its most plausible interpretations with separate queries.",
  "- If the question is already specific, return a single tight query.",
].join("\n")

function extractJsonObject(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

export async function planAgentQueries(
  question: string,
  complete: AgentCompletion,
): Promise<readonly string[]> {
  try {
    const { text } = await complete([
      { role: "system", content: AGENT_PLANNER_PROMPT },
      { role: "user", content: question },
    ])
    const parsed = agentPlanSchema.safeParse(extractJsonObject(text))
    return parsed.success ? parsed.data.queries : [question]
  } catch {
    return [question]
  }
}

function normalizedTitle(title: string): string {
  return title.toLowerCase().replaceAll(/[^a-z0-9가-힣]+/g, "")
}

function mergeHits(lists: readonly (readonly AgentSearchHit[])[]): AgentSearchHit[] {
  const seen = new Set<string>()
  const merged: AgentSearchHit[] = []
  for (let index = 0; merged.length < AGENT_SEARCH_RESULT_LIMIT; index += 1) {
    let added = false
    for (const list of lists) {
      const hit = list[index]
      if (!hit || merged.length >= AGENT_SEARCH_RESULT_LIMIT) continue
      const keys = [hit.dedupeKey, normalizedTitle(hit.paper.title)]
      if (keys.some((key) => seen.has(key))) continue
      for (const key of keys) seen.add(key)
      merged.push(hit)
      added = true
    }
    if (!added) break
  }
  return merged
}

function scholarlyItemToHit(item: ScholarlySearchItem): AgentSearchHit {
  return {
    paper: {
      provider: item.provider,
      title: item.title,
      authors: item.authors,
      year: item.year,
      venue: item.venue,
      landingUrl: item.landingUrl,
      fullTextUrl: item.access.fullText.state === "unavailable" ? null : item.access.fullText.url,
      citationCount: item.citationCount,
    },
    abstract: item.abstract,
    dedupeKey: (item.identity.doi ?? item.identity.arxivId ?? item.title).toLowerCase(),
  }
}

export type AgentStepListener = (step: AgentStep) => void

export async function askAgent(
  value: AgentAskRequest,
  deps: AgentServiceDeps,
  onStep: AgentStepListener = () => {},
): Promise<AgentAskResult> {
  const request = agentAskRequestSchema.parse(value)
  onStep({ id: "plan", kind: "plan", status: "running" })
  const [queries, contextDocs] = await Promise.all([
    deps.plan(request.question).catch(() => [request.question] as const),
    Promise.resolve(deps.contextDocs(request.contextDocIds)),
  ])
  const plannedQueries = queries.slice(0, AGENT_QUERY_MAX)
  onStep({ id: "plan", kind: "plan", status: "done", queries: [...plannedQueries] })
  if (contextDocs.length > 0) {
    onStep({
      id: "context",
      kind: "context",
      status: "done",
      found: contextDocs.length,
    })
  }
  const hitLists = await Promise.all(
    plannedQueries.map(async (query, index) => {
      const id = `search:${index}`
      onStep({ id, kind: "search", status: "running", query })
      try {
        const found = await deps.paperSearch(query)
        onStep({ id, kind: "search", status: "done", query, found: found.length })
        return found
      } catch (error) {
        console.warn(`[agent] semantic scholar search failed for "${query}":`, error)
        onStep({ id, kind: "search", status: "failed", query, detail: "semantic_scholar" })
        return [] as readonly AgentSearchHit[]
      }
    }),
  )
  let hits = mergeHits(hitLists)
  if (hits.length === 0) {
    const fallbackLists = await Promise.all(
      plannedQueries.map(async (query, index) => {
        const id = `fallback:${index}`
        onStep({ id, kind: "fallback", status: "running", query })
        try {
          const result = await deps.search({ query })
          const found = result.results.map(scholarlyItemToHit)
          onStep({ id, kind: "fallback", status: "done", query, found: found.length })
          return found
        } catch (error) {
          console.warn(`[agent] scholarly fallback search failed for "${query}":`, error)
          onStep({ id, kind: "fallback", status: "failed", query, detail: "scholarly_search" })
          return [] as readonly AgentSearchHit[]
        }
      }),
    )
    hits = mergeHits(fallbackLists)
  }
  const papers = hits.map((hit) => hit.paper)
  const userPrompt = buildAgentUserPrompt({
    question: request.question,
    contextDocs,
    papers,
    abstracts: hits.map((hit) => hit.abstract),
  })
  const history = request.history.map(
    (message): AgentCompletionMessage => ({ role: message.role, content: message.content }),
  )
  const messages: AgentCompletionMessage[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userPrompt },
  ]
  onStep({ id: "compose", kind: "compose", status: "running" })
  const completion = await deps.complete(messages)
  onStep({ id: "compose", kind: "compose", status: "done", detail: completion.model })
  return agentAskResultSchema.parse({
    answer: completion.text,
    model: completion.model,
    papers,
  })
}
