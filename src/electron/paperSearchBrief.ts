import { z } from "zod"
import {
  AGENT_QUERY_MAX,
  type AgentContextDoc,
  type AgentMessage,
  type AgentMode,
} from "../shared/agentChat"
import {
  type AgentCompletion,
  answerLanguage,
  parseJsonObject,
  writesKorean,
} from "./agentCompletion"

/** What the planner understood the user to be looking for, in searchable form. */
export type SearchBrief = {
  readonly interpretation: string
  readonly queries: readonly string[]
  readonly semanticQuery: string
  readonly criteria: readonly string[]
  readonly yearFrom: number | null
  readonly yearTo: number | null
}

const trimmedList = (maxItems: number, maxLength: number) =>
  z.array(z.unknown()).transform((values) =>
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.replace(/\s+/gu, " ").trim().slice(0, maxLength))
      .filter((value) => value.length > 1)
      .slice(0, maxItems),
  )

const yearSchema = z
  .unknown()
  .transform((value) =>
    typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100
      ? value
      : null,
  )

const briefSchema = z.object({
  interpretation: z.string().catch("").default(""),
  queries: trimmedList(AGENT_QUERY_MAX, 200).refine((queries) => queries.length > 0),
  semanticQuery: z.string().trim().min(3),
  criteria: trimmedList(5, 300).catch([]),
  yearFrom: yearSchema.default(null),
  yearTo: yearSchema.default(null),
})

export const searchBriefJsonSchema = {
  type: "object",
  properties: {
    interpretation: { type: "string" },
    queries: { type: "array", items: { type: "string" }, minItems: 1 },
    semanticQuery: { type: "string" },
    criteria: { type: "array", items: { type: "string" } },
    yearFrom: { type: "integer" },
    yearTo: { type: "integer" },
  },
  required: ["interpretation", "queries", "semanticQuery", "criteria", "yearFrom", "yearTo"],
  additionalProperties: false,
} as const

function plannerPrompt(mode: AgentMode, today: Date, question: string): string {
  const year = today.getUTCFullYear()
  const queryCount = mode === "deep" ? "4-6" : "3-4"
  return [
    "You turn a researcher's request into a literature-search plan for academic paper indices",
    "(arXiv keyword search, Semantic Scholar keyword search, OpenAlex embedding search).",
    "Requests are often vague, colloquial, misspelled, or written in Korean. Infer the most",
    "plausible research intent. Resolve references to earlier turns (e.g. 'that', '그거', '더').",
    "",
    'Return ONLY a JSON object: {"interpretation": string, "queries": string[],',
    '"semanticQuery": string, "criteria": string[], "yearFrom": int, "yearTo": int}',
    `- interpretation: one sentence in ${answerLanguage(question)} stating which papers you will look for.`,
    `- queries: ${queryCount} short English keyword queries (2-5 words each) using precise academic`,
    "  terminology: canonical method/task names, common synonyms and alternative phrasings. Cover",
    "  distinct plausible interpretations with separate queries. No filler words like 'paper' or",
    "  'research'; add 'survey' only if the user wants an overview.",
    "- If the request names a specific paper, model, system, benchmark, dataset or acronym, the",
    "  first query is that exact name verbatim (original spelling and casing, nothing added) and",
    "  semanticQuery mentions it; never replace an unfamiliar name with a guessed expansion.",
    "- semanticQuery: one English sentence describing the content of an ideal matching paper.",
    "- criteria: 2-4 concrete English conditions a paper must meet to be relevant.",
    `- yearFrom/yearTo: today is ${today.toISOString().slice(0, 10)}. For 'latest'/'recent'/'최신'/'요즘'`,
    `  use yearFrom ${year - 2}. Use explicit years when given. Otherwise 0.`,
  ].join("\n")
}

function plannerInput(input: {
  readonly question: string
  readonly history: readonly AgentMessage[]
  readonly contextDocs: readonly AgentContextDoc[]
}): string {
  const parts = [`LATEST REQUEST:\n${input.question}`]
  const recent = input.history.slice(-6)
  if (recent.length > 0) {
    parts.push(
      `EARLIER CONVERSATION (oldest first):\n${recent
        .map((message) => `${message.role}: ${message.content.slice(0, 600)}`)
        .join("\n")}`,
    )
  }
  if (input.contextDocs.length > 0) {
    parts.push(
      `PAPERS THE USER ATTACHED:\n${input.contextDocs
        .map((doc) => `- ${doc.title}${doc.year ? ` (${doc.year})` : ""}`)
        .join("\n")}`,
    )
  }
  return parts.join("\n\n")
}

/** Used when the planner fails: search with the raw request so the user still gets results. */
export function fallbackBrief(question: string): SearchBrief {
  const query = question.replace(/\s+/gu, " ").trim().slice(0, 200)
  return {
    interpretation: "",
    queries: writesKorean(query) ? [] : [query],
    semanticQuery: query,
    criteria: [query],
    yearFrom: null,
    yearTo: null,
  }
}

export function parseSearchBrief(text: string): SearchBrief | null {
  const parsed = briefSchema.safeParse(parseJsonObject(text))
  if (!parsed.success) return null
  const brief = parsed.data
  return {
    interpretation: brief.interpretation.trim().slice(0, 400),
    queries: [...new Set(brief.queries)],
    semanticQuery: brief.semanticQuery.slice(0, 1_000),
    criteria: brief.criteria,
    yearFrom: brief.yearFrom,
    yearTo:
      brief.yearTo !== null && brief.yearFrom !== null && brief.yearTo < brief.yearFrom
        ? null
        : brief.yearTo,
  }
}

export async function planSearchBrief(
  input: {
    readonly question: string
    readonly history: readonly AgentMessage[]
    readonly contextDocs: readonly AgentContextDoc[]
    readonly mode: AgentMode
    readonly today: Date
  },
  complete: AgentCompletion,
  signal?: AbortSignal,
): Promise<{ readonly brief: SearchBrief; readonly planned: boolean }> {
  try {
    const { text } = await complete(
      [
        { role: "system", content: plannerPrompt(input.mode, input.today, input.question) },
        { role: "user", content: plannerInput(input) },
      ],
      { signal, jsonSchema: searchBriefJsonSchema },
    )
    const brief = parseSearchBrief(text)
    if (brief) return { brief, planned: true }
  } catch (error) {
    if (signal?.aborted) throw error
  }
  return { brief: fallbackBrief(input.question), planned: false }
}
