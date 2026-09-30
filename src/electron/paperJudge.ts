import { z } from "zod"
import type { Locale } from "../shared/i18n/locale"
import { type AgentCompletion, answerLanguage, parseJsonObject } from "./agentCompletion"
import type { PaperCandidate } from "./paperCandidates"
import type { SearchBrief } from "./paperSearchBrief"

export type Judgment = { readonly score: number; readonly reason: string }

export type JudgeOutcome = {
  readonly judgments: ReadonlyMap<string, Judgment>
  readonly nextQueries: readonly string[]
  /** False when the model failed and scores come from term overlap instead. */
  readonly judgedByModel: boolean
}

const judgmentSchema = z.object({
  id: z.string(),
  score: z.coerce.number().int().min(0).max(3),
  reason: z.string().catch("").default(""),
})

const judgeResponseSchema = z.object({
  judgments: z.array(z.unknown()),
  nextQueries: z.array(z.unknown()).catch([]).default([]),
})

export const judgeJsonSchema = {
  type: "object",
  properties: {
    judgments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 3 },
          reason: { type: "string" },
        },
        required: ["id", "score", "reason"],
        additionalProperties: false,
      },
    },
    nextQueries: { type: "array", items: { type: "string" } },
  },
  required: ["judgments", "nextQueries"],
  additionalProperties: false,
} as const

function judgePrompt(question: string, wantsNextQueries: boolean, language?: Locale): string {
  return [
    "You screen academic search results for a researcher. Judge each candidate paper against",
    "the request and its criteria using its title and abstract. Be strict: topical word overlap",
    "is not enough, the paper must actually address what the researcher is looking for.",
    "",
    'Return ONLY JSON: {"judgments": [{"id": string, "score": 0-3, "reason": string}], "nextQueries": string[]}',
    "- Judge every candidate id exactly once.",
    "- score 3: directly addresses the request. 2: closely related and useful. 1: tangential. 0: unrelated.",
    `- reason: for scores 2-3, one short sentence in ${answerLanguage(question, language)} naming what this`,
    "  paper contributes to the request. Empty string for scores 0-1.",
    wantsNextQueries
      ? "- nextQueries: 0-3 new short English keyword queries (2-5 words) for important aspects the relevant papers suggest but the searches so far missed (use terminology seen in relevant papers). Empty if coverage looks complete."
      : "- nextQueries: return an empty array.",
  ].join("\n")
}

function candidateBlock(id: string, candidate: PaperCandidate): string {
  const meta = [
    candidate.year ?? "n.d.",
    candidate.venue,
    candidate.citationCount === null ? "" : `cited ${candidate.citationCount}`,
  ]
    .filter((part) => part !== "")
    .join(", ")
  const abstract = candidate.abstract ? candidate.abstract.slice(0, 450) : "(no abstract)"
  return `[${id}] ${candidate.title} (${meta})\n${abstract}`
}

function judgeInput(
  question: string,
  brief: SearchBrief,
  candidates: readonly (readonly [string, PaperCandidate])[],
): string {
  return [
    `REQUEST:\n${question}`,
    brief.interpretation ? `INTERPRETATION:\n${brief.interpretation}` : "",
    brief.criteria.length > 0 ? `CRITERIA:\n${brief.criteria.map((c) => `- ${c}`).join("\n")}` : "",
    `QUERIES ALREADY RUN:\n${brief.queries.join(" | ")}`,
    `CANDIDATES:\n${candidates.map(([id, candidate]) => candidateBlock(id, candidate)).join("\n\n")}`,
  ]
    .filter((part) => part !== "")
    .join("\n\n")
}

function terms(text: string): readonly string[] {
  return [
    ...new Set(
      text
        .normalize("NFKC")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 3),
    ),
  ]
}

/** Term-overlap scoring used only when the model cannot judge. */
export function lexicalJudgments(
  brief: SearchBrief,
  candidates: readonly (readonly [string, PaperCandidate])[],
): ReadonlyMap<string, Judgment> {
  const wanted = terms([...brief.queries, ...brief.criteria, brief.semanticQuery].join(" "))
  const judgments = new Map<string, Judgment>()
  for (const [id, candidate] of candidates) {
    const text = new Set(terms(`${candidate.title} ${candidate.abstract ?? ""}`))
    const hits = wanted.filter((term) => text.has(term)).length
    const ratio = wanted.length === 0 ? 0 : hits / wanted.length
    judgments.set(id, { score: ratio >= 0.5 ? 2 : ratio >= 0.25 ? 1 : 0, reason: "" })
  }
  return judgments
}

export function parseJudgeResponse(
  text: string,
  ids: ReadonlySet<string>,
): { readonly judgments: Map<string, Judgment>; readonly nextQueries: string[] } | null {
  const parsed = judgeResponseSchema.safeParse(parseJsonObject(text))
  if (!parsed.success) return null
  const judgments = new Map<string, Judgment>()
  for (const value of parsed.data.judgments) {
    const judgment = judgmentSchema.safeParse(value)
    if (!judgment.success || !ids.has(judgment.data.id)) continue
    judgments.set(judgment.data.id, {
      score: judgment.data.score,
      reason: judgment.data.score >= 2 ? judgment.data.reason.trim().slice(0, 300) : "",
    })
  }
  if (judgments.size === 0) return null
  const nextQueries = parsed.data.nextQueries
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.replace(/\s+/gu, " ").trim().slice(0, 200))
    .filter((value) => value.length > 1)
    .slice(0, 3)
  return { judgments, nextQueries }
}

export async function judgeCandidates(
  input: {
    readonly question: string
    readonly brief: SearchBrief
    readonly candidates: readonly (readonly [string, PaperCandidate])[]
    readonly wantsNextQueries: boolean
    readonly language?: Locale | undefined
  },
  complete: AgentCompletion,
  signal?: AbortSignal,
): Promise<JudgeOutcome> {
  if (input.candidates.length === 0) {
    return { judgments: new Map(), nextQueries: [], judgedByModel: true }
  }
  const ids = new Set(input.candidates.map(([id]) => id))
  try {
    const { text } = await complete(
      [
        {
          role: "system",
          content: judgePrompt(input.question, input.wantsNextQueries, input.language),
        },
        { role: "user", content: judgeInput(input.question, input.brief, input.candidates) },
      ],
      { signal, jsonSchema: judgeJsonSchema },
    )
    const parsed = parseJudgeResponse(text, ids)
    if (parsed) {
      const fallback = lexicalJudgments(input.brief, input.candidates)
      for (const [id] of input.candidates) {
        if (!parsed.judgments.has(id)) {
          parsed.judgments.set(id, fallback.get(id) ?? { score: 0, reason: "" })
        }
      }
      return { ...parsed, judgedByModel: true }
    }
  } catch (error) {
    if (signal?.aborted) throw error
  }
  return {
    judgments: lexicalJudgments(input.brief, input.candidates),
    nextQueries: [],
    judgedByModel: false,
  }
}
