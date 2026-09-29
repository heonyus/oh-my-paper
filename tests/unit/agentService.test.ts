// @vitest-environment node

import { describe, expect, it } from "vitest"
import type {
  AgentCompletionMessage,
  AgentCompletionOptions,
} from "../../src/electron/agentCompletion"
import { askAgent } from "../../src/electron/agentService"
import type { PaperCandidate } from "../../src/electron/paperCandidates"
import type { PaperDiscoverySources, PaperSearchFunction } from "../../src/electron/paperDiscovery"
import { PaperSourceError } from "../../src/electron/paperSourceHttp"
import type { AgentStep } from "../../src/shared/agentChat"
import { documentIdSchema } from "../../src/shared/schemas"

const docId = documentIdSchema.parse("aabbccddeeff0011")

function candidate(title: string, overrides: Partial<PaperCandidate> = {}): PaperCandidate {
  return {
    source: "arxiv",
    title,
    authors: ["A. Author"],
    year: 2025,
    venue: "arXiv",
    abstract: `${title} abstract`,
    landingUrl: "https://arxiv.org/abs/2501.00001",
    fullTextUrl: "https://arxiv.org/pdf/2501.00001",
    citationCount: null,
    ids: { doi: null, arxivId: null, s2Id: null, openAlexId: null },
    ...overrides,
  }
}

type BriefOverrides = Partial<{
  interpretation: string
  queries: string[]
  semanticQuery: string
  criteria: string[]
  yearFrom: number
  yearTo: number
}>

type Harness = {
  readonly messages: AgentCompletionMessage[][]
  readonly calls: string[]
}

/** Scores titles containing "core" 3, "useful" 2, "side" 1, everything else 0. */
function scoreFor(title: string): number {
  if (title.includes("core")) return 3
  if (title.includes("useful")) return 2
  if (title.includes("side")) return 1
  return 0
}

function completion(
  harness: Harness,
  options: {
    readonly brief?: BriefOverrides | "fail"
    readonly judge?: "fail"
    readonly nextQueries?: readonly string[]
    readonly answer?: string
  } = {},
) {
  return async (messages: readonly AgentCompletionMessage[], call?: AgentCompletionOptions) => {
    harness.messages.push([...messages])
    const schema = JSON.stringify(call?.jsonSchema ?? {})
    if (schema.includes("semanticQuery")) {
      harness.calls.push("plan")
      if (options.brief === "fail") throw new Error("planner down")
      return {
        text: `Plan:\n\`\`\`json\n${JSON.stringify({
          interpretation: "긴 문서를 파라미터에 기억시키는 방법",
          queries: ["parametric memory", "document memorization"],
          semanticQuery: "Store long documents in model weights.",
          criteria: ["stores documents in parameters"],
          yearFrom: 0,
          yearTo: 0,
          ...options.brief,
        })}\n\`\`\``,
        model: "test-model",
      }
    }
    if (schema.includes("judgments")) {
      harness.calls.push("judge")
      if (options.judge === "fail") throw new Error("judge down")
      const input = messages.at(-1)?.content ?? ""
      const judgments = [...input.matchAll(/^\[(p\d+)\] (.+?) \(/gmu)].map(([, id, title]) => ({
        id,
        score: scoreFor(title ?? ""),
        reason: `${title} 설명`,
      }))
      const isFirstJudge = harness.calls.filter((call) => call === "judge").length === 1
      return {
        text: JSON.stringify({
          judgments,
          nextQueries: isFirstJudge ? (options.nextQueries ?? []) : [],
        }),
        model: "test-model",
      }
    }
    harness.calls.push("compose")
    return { text: options.answer ?? "답변입니다 [1].", model: "test-model" }
  }
}

function sources(
  overrides: Partial<{
    semantic: PaperSearchFunction
    arxiv: PaperSearchFunction
    s2: PaperSearchFunction
    recommendations: PaperDiscoverySources["recommendations"]
    references: PaperDiscoverySources["references"]
    citing: PaperDiscoverySources["citing"]
  }> = {},
): PaperDiscoverySources {
  const none = async () => []
  return {
    semantic: { label: "OpenAlex", search: overrides.semantic ?? none },
    keyword: [
      { label: "arXiv", search: overrides.arxiv ?? none },
      { label: "Semantic Scholar", search: overrides.s2 ?? none },
    ],
    recommendations: overrides.recommendations ?? none,
    references: overrides.references ?? none,
    citing: overrides.citing ?? none,
  }
}

function harness(): Harness {
  return { messages: [], calls: [] }
}

describe("askAgent quick search", () => {
  it("answers with screened papers only, carrying relevance and reasons", async () => {
    const h = harness()
    const searched: string[] = []
    const result = await askAgent(
      { question: "rag 말고 모델에 문서 기억시키는거" },
      {
        complete: completion(h),
        contextDocs: () => [],
        sources: sources({
          semantic: async ({ query }) => {
            searched.push(`semantic:${query}`)
            return [candidate("A core method"), candidate("Unrelated vision paper")]
          },
          arxiv: async ({ query }) => {
            searched.push(`arxiv:${query}`)
            return [candidate(`A useful ${query} study`)]
          },
        }),
      },
    )
    expect(h.calls).toEqual(["plan", "judge", "compose"])
    expect(searched).toEqual(
      expect.arrayContaining([
        "semantic:Store long documents in model weights.",
        "arxiv:parametric memory",
        "arxiv:document memorization",
      ]),
    )
    expect(result.papers.map((paper) => paper.title)).toEqual([
      "A core method",
      "A useful parametric memory study",
      "A useful document memorization study",
    ])
    expect(result.papers[0]).toMatchObject({ relevance: 3, reason: "A core method 설명" })
    expect(result.answer).toBe("답변입니다 [1].")
  })

  it("merges the same paper found by different sources", async () => {
    const h = harness()
    const result = await askAgent(
      { question: "q" },
      {
        complete: completion(h),
        contextDocs: () => [],
        sources: sources({
          semantic: async () => [
            candidate("The core paper", {
              source: "openalex",
              abstract: null,
              ids: {
                doi: "10.48550/arxiv.2501.00001",
                arxivId: null,
                s2Id: null,
                openAlexId: "W1",
              },
            }),
          ],
          arxiv: async () => [
            candidate("The core paper (preprint title)", {
              abstract: "full abstract",
              ids: { doi: null, arxivId: "2501.00001", s2Id: null, openAlexId: null },
            }),
          ],
        }),
      },
    )
    expect(result.papers).toHaveLength(1)
    expect(result.papers[0]?.provider).toBe("openalex")
    const prompt = h.messages.at(-1)?.at(-1)?.content ?? ""
    expect(prompt).toContain("abstract: full abstract")
  })

  it("lists weakly related papers when nothing is clearly relevant", async () => {
    const h = harness()
    const result = await askAgent(
      { question: "q" },
      {
        complete: completion(h),
        contextDocs: () => [],
        sources: sources({
          semantic: async () => [candidate("A side note"), candidate("Nothing here")],
        }),
      },
    )
    expect(result.papers.map((paper) => paper.title)).toEqual(["A side note"])
    expect(h.messages.at(-1)?.at(-1)?.content).toContain("only weakly related papers are listed")
  })

  it("falls back to semantic search with the raw question when planning fails", async () => {
    const h = harness()
    const keyword: string[] = []
    const semantic: string[] = []
    const steps: AgentStep[] = []
    await askAgent(
      { question: "긴 문서 기억하는 LLM" },
      {
        complete: completion(h, { brief: "fail" }),
        contextDocs: () => [],
        sources: sources({
          semantic: async ({ query }) => {
            semantic.push(query)
            return []
          },
          arxiv: async ({ query }) => {
            keyword.push(query)
            return []
          },
        }),
      },
      (step) => steps.push(step),
    )
    expect(semantic).toEqual(["긴 문서 기억하는 LLM"])
    expect(keyword).toEqual([])
    expect(steps.find((step) => step.id === "plan" && step.status !== "running")?.status).toBe(
      "failed",
    )
  })

  it("scores by keyword overlap when the relevance judge fails", async () => {
    const h = harness()
    const steps: AgentStep[] = []
    const result = await askAgent(
      { question: "q" },
      {
        complete: completion(h, { judge: "fail" }),
        contextDocs: () => [],
        sources: sources({
          semantic: async () => [
            candidate("Parametric memory for document memorization", { abstract: null }),
            candidate("Graph coloring heuristics", { abstract: null }),
          ],
        }),
      },
      (step) => steps.push(step),
    )
    expect(result.papers.map((paper) => paper.title)).toEqual([
      "Parametric memory for document memorization",
    ])
    const judged = steps.find((step) => step.kind === "judge" && step.status === "done")
    expect(judged?.detail).toContain("키워드 일치로 판정")
  })

  it("rests a rate-limited source and lists it only on rows where nothing else ran", async () => {
    const h = harness()
    let s2Calls = 0
    const steps: AgentStep[] = []
    await askAgent(
      { question: "q" },
      {
        complete: completion(h),
        contextDocs: () => [],
        sources: sources({
          s2: async () => {
            s2Calls += 1
            throw new PaperSourceError("rate_limited", 429)
          },
          arxiv: async () => [candidate("A core result")],
        }),
      },
      (step) => steps.push(step),
    )
    expect(s2Calls).toBe(1)
    const details = steps
      .filter((step) => step.kind === "search" && step.status === "done")
      .map((step) => step.detail)
    expect(details).toContain("arXiv 1 · Semantic Scholar 요청 한도 초과")
    expect(details).toContain("arXiv 1")
  })

  it("says why a row ran nothing when every keyword source is resting", async () => {
    const steps: AgentStep[] = []
    const limited = async () => {
      throw new PaperSourceError("rate_limited", 429)
    }
    await askAgent(
      { question: "q" },
      {
        complete: completion(harness()),
        contextDocs: () => [],
        sources: sources({ s2: limited, arxiv: limited }),
      },
      (step) => steps.push(step),
    )
    const failed = steps
      .filter((step) => step.kind === "search" && step.status === "failed")
      .map((step) => step.detail)
    expect(failed).toContain("arXiv 요청 한도 초과 · Semantic Scholar 요청 한도 초과")
    expect(failed).toContain("arXiv 한도 초과로 건너뜀 · Semantic Scholar 한도 초과로 건너뜀")
  })

  it("tries a rate-limited source again once its cool-down has passed", async () => {
    let clock = 1_000_000
    let s2Calls = 0
    const result = await askAgent(
      { question: "q" },
      {
        complete: completion(harness()),
        contextDocs: () => [],
        // Every look at the clock moves it past the 20 s cool-down.
        now: () => {
          clock += 25_000
          return new Date(clock)
        },
        sources: sources({
          s2: async () => {
            s2Calls += 1
            if (s2Calls === 1) throw new PaperSourceError("rate_limited", 429, 5)
            return [candidate("A core result")]
          },
        }),
      },
    )
    expect(s2Calls).toBe(2)
    expect(result.papers.map((paper) => paper.title)).toEqual(["A core result"])
  })

  it("uses history for planning and cites attached library papers", async () => {
    const h = harness()
    await askAgent(
      {
        question: "그거 더 찾아줘",
        contextDocIds: [docId],
        history: [
          { role: "user", content: "파라미터 메모리 논문 찾아줘" },
          { role: "assistant", content: "몇 편 찾았습니다." },
        ],
      },
      {
        complete: completion(h),
        contextDocs: () => [
          {
            documentId: docId,
            title: "My Library Paper",
            authors: ["Kim"],
            year: 2024,
            excerpt: "메모리 모듈",
          },
        ],
        sources: sources(),
      },
    )
    const plannerInput = h.messages[0]?.at(-1)?.content ?? ""
    expect(plannerInput).toContain("user: 파라미터 메모리 논문 찾아줘")
    expect(plannerInput).toContain("- My Library Paper (2024)")
    const composeMessages = h.messages.at(-1) ?? []
    expect(composeMessages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ])
    expect(composeMessages.at(-1)?.content).toContain('[L1] "My Library Paper"')
  })

  it("drops citation markers that point past the listed papers", async () => {
    const result = await askAgent(
      { question: "q" },
      {
        complete: completion(harness(), { answer: "근거 [1], 없는 근거 [7], 범위 [1-2]." }),
        contextDocs: () => [],
        sources: sources({ semantic: async () => [candidate("A core paper")] }),
      },
    )
    expect(result.answer).toBe("근거 [1], 없는 근거 , 범위 [1].")
  })

  it("stops when the request is cancelled", async () => {
    const controller = new AbortController()
    const run = askAgent(
      { question: "q" },
      {
        complete: completion(harness()),
        contextDocs: () => [],
        sources: sources({
          semantic: async () => {
            controller.abort()
            throw new Error("aborted")
          },
        }),
      },
      () => {},
      controller.signal,
    )
    await expect(run).rejects.toThrow("aborted")
  })

  it("rejects an empty question", async () => {
    await expect(
      askAgent(
        { question: "  " },
        { complete: completion(harness()), contextDocs: () => [], sources: sources() },
      ),
    ).rejects.toThrow()
  })
})

describe("askAgent web fallback", () => {
  it("searches the web once when the indices find fewer than two relevant papers", async () => {
    const h = harness()
    const steps: AgentStep[] = []
    const webQueries: string[] = []
    const result = await askAgent(
      { question: "medRSI 논문 찾아와" },
      {
        complete: completion(h),
        contextDocs: () => [],
        sources: {
          ...sources({ semantic: async () => [candidate("Nothing relevant")] }),
          fallback: {
            label: "웹(Claude)",
            search: async ({ query }) => {
              webQueries.push(query)
              return [candidate("The core web paper")]
            },
          },
        },
      },
      (step) => steps.push(step),
    )
    expect(webQueries).toEqual([
      "medRSI 논문 찾아와 (keywords: parametric memory | document memorization)",
    ])
    expect(h.calls).toEqual(["plan", "judge", "judge", "compose"])
    expect(steps.find((step) => step.kind === "fallback" && step.status === "done")).toMatchObject({
      found: 1,
      detail: "웹(Claude) 1",
    })
    expect(result.papers.map((paper) => paper.title)).toEqual(["The core web paper"])
  })

  it("leaves the web alone when the indices already found enough", async () => {
    let webCalls = 0
    await askAgent(
      { question: "q" },
      {
        complete: completion(harness()),
        contextDocs: () => [],
        sources: {
          ...sources({
            semantic: async () => [candidate("First core paper"), candidate("Second core paper")],
          }),
          fallback: {
            label: "웹(Claude)",
            search: async () => {
              webCalls += 1
              return []
            },
          },
        },
      },
    )
    expect(webCalls).toBe(0)
  })

  it("still searches the web when every index came back empty", async () => {
    const h = harness()
    const result = await askAgent(
      { question: "q" },
      {
        complete: completion(h),
        contextDocs: () => [],
        sources: {
          ...sources(),
          fallback: { label: "웹(Claude)", search: async () => [candidate("A useful web paper")] },
        },
      },
    )
    expect(h.calls).toEqual(["plan", "judge", "compose"])
    expect(result.papers.map((paper) => paper.title)).toEqual(["A useful web paper"])
  })
})

describe("askAgent deep research", () => {
  it("expands from relevant seeds, runs follow-up queries and screens again", async () => {
    const h = harness()
    const followUps: string[] = []
    const seedsSeen: string[][] = []
    const steps: AgentStep[] = []
    const result = await askAgent(
      { question: "q", mode: "deep" },
      {
        complete: completion(h, { nextQueries: ["knowledge editing"] }),
        contextDocs: () => [],
        sources: sources({
          semantic: async () => [candidate("Seed core paper"), candidate("Noise")],
          arxiv: async ({ query }) => {
            if (query === "knowledge editing") {
              followUps.push(query)
              return [candidate("Follow-up useful paper")]
            }
            return []
          },
          recommendations: async (seeds) => {
            seedsSeen.push(seeds.map((seed) => seed.title))
            return [candidate("Recommended core paper")]
          },
          references: async () => [candidate("Old useful reference", { year: 2015 })],
        }),
      },
      (step) => steps.push(step),
    )
    expect(followUps).toEqual(["knowledge editing"])
    expect(seedsSeen[0]).toEqual(["Seed core paper"])
    expect(steps.some((step) => step.kind === "expand" && step.status === "done")).toBe(true)
    const titles = result.papers.map((paper) => paper.title)
    expect(titles.slice(0, 2)).toEqual(["Seed core paper", "Recommended core paper"])
    expect(new Set(titles.slice(2))).toEqual(
      new Set(["Follow-up useful paper", "Old useful reference"]),
    )
    expect(h.messages.at(-1)?.[0]?.content).toContain("literature review report")
    expect(h.calls.filter((call) => call === "judge").length).toBeLessThanOrEqual(3)
  })

  it("keeps expansion results inside the requested year window", async () => {
    const result = await askAgent(
      { question: "최신 연구", mode: "deep" },
      {
        complete: completion(harness(), { brief: { yearFrom: 2024 } }),
        contextDocs: () => [],
        sources: sources({
          semantic: async () => [candidate("Seed core paper", { year: 2025 })],
          references: async () => [
            candidate("Old core reference", { year: 2019 }),
            candidate("New core reference", { year: 2024 }),
          ],
        }),
      },
    )
    const titles = result.papers.map((paper) => paper.title)
    expect(titles).toContain("New core reference")
    expect(titles).not.toContain("Old core reference")
  })
})
