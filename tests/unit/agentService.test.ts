// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
  type AgentCompletionMessage,
  askAgent,
  planAgentQueries,
} from "../../src/electron/agentService"
import type { AgentSearchHit } from "../../src/electron/semanticScholarSearch"
import type { AgentContextDoc, AgentPaper, AgentStep } from "../../src/shared/agentChat"
import { documentIdSchema } from "../../src/shared/schemas"
import type { ScholarlySearchItem } from "../../src/shared/scholarlySearchSchemas"

const docId = documentIdSchema.parse("aabbccddeeff0011")

function paper(overrides: Partial<AgentPaper> = {}): AgentPaper {
  return {
    provider: "semanticscholar",
    title: "Attention Is All You Need",
    authors: ["A. Vaswani"],
    year: 2017,
    venue: "NeurIPS",
    landingUrl: "https://arxiv.org/abs/1706.03762",
    fullTextUrl: "https://arxiv.org/pdf/1706.03762",
    citationCount: 100,
    ...overrides,
  }
}

function hit(overrides: Partial<AgentSearchHit> = {}): AgentSearchHit {
  return {
    paper: paper(),
    abstract: "We propose the Transformer architecture.",
    dedupeKey: "10.1/example",
    ...overrides,
  }
}

function scholarlyItem(overrides: Partial<ScholarlySearchItem> = {}): ScholarlySearchItem {
  return {
    provider: "arxiv",
    identity: {
      providerRecordId: "r1",
      doi: "10.1/fallback",
      arxivId: "2401.00001",
      openAlexId: null,
    },
    title: "Fallback Paper",
    authors: ["B. Author"],
    year: 2024,
    venue: "arXiv",
    abstract: "fallback abstract",
    landingUrl: "https://arxiv.org/abs/2401.00001",
    citationCount: 3,
    access: {
      metadata: "available",
      abstract: "available",
      fullText: { state: "open", url: "https://arxiv.org/pdf/2401.00001" },
    },
    ...overrides,
  }
}

type DepsOverrides = {
  queries?: readonly string[]
  planError?: boolean
  hitsByQuery?: Readonly<Record<string, readonly AgentSearchHit[]>>
  paperSearchError?: boolean
  fallbackItems?: readonly ScholarlySearchItem[]
  contextDocs?: readonly AgentContextDoc[]
}

function deps(overrides: DepsOverrides = {}) {
  const messages: AgentCompletionMessage[] = []
  const searched: string[] = []
  return {
    plan: async (question: string) => {
      if (overrides.planError) throw new Error("plan failed")
      return overrides.queries ?? [question]
    },
    paperSearch: async (query: string) => {
      searched.push(query)
      if (overrides.paperSearchError) throw new Error("s2 down")
      if (overrides.hitsByQuery) return overrides.hitsByQuery[query] ?? []
      return [hit()]
    },
    search: async () => ({
      status: "complete" as const,
      results: [...(overrides.fallbackItems ?? [])],
    }),
    complete: async (input: readonly AgentCompletionMessage[]) => {
      messages.push(...input)
      return { text: "Transformer는 self-attention 기반 모델입니다 [1].", model: "test-model" }
    },
    contextDocs: () => overrides.contextDocs ?? [],
    messages,
    searched,
  }
}

describe("askAgent", () => {
  it("answers with mapped papers and the configured model", async () => {
    const result = await askAgent({ question: "Transformer가 뭐야?" }, deps())
    expect(result.answer).toContain("Transformer")
    expect(result.model).toBe("test-model")
    expect(result.papers).toHaveLength(1)
    expect(result.papers[0]?.provider).toBe("semanticscholar")
    expect(result.papers[0]?.fullTextUrl).toBe("https://arxiv.org/pdf/1706.03762")
  })

  it("expands the question into planner queries and merges hits round-robin", async () => {
    const queries = ["blood flow", "health data flow", "patient workflow"]
    const hitsByQuery = {
      "blood flow": [
        hit({ dedupeKey: "a", paper: paper({ title: "A" }) }),
        hit({ dedupeKey: "a2", paper: paper({ title: "A2" }) }),
      ],
      "health data flow": [hit({ dedupeKey: "b", paper: paper({ title: "B" }) })],
      "patient workflow": [hit({ dedupeKey: "c", paper: paper({ title: "C" }) })],
    }
    const d = deps({ queries, hitsByQuery })
    const result = await askAgent({ question: "health flow" }, d)
    expect(d.searched).toEqual(queries)
    const titles = result.papers.map((p) => p.title)
    expect(titles.slice(0, 3)).toEqual(["A", "B", "C"])
    expect(titles).toContain("A2")
  })

  it("still answers when planning and search both fail", async () => {
    const result = await askAgent(
      { question: "attention 설명해줘" },
      deps({ planError: true, paperSearchError: true }),
    )
    expect(result.papers).toHaveLength(0)
    expect(result.answer).toBeTruthy()
  })

  it("falls back to the three-provider search when Semantic Scholar returns nothing", async () => {
    const result = await askAgent(
      { question: "rare topic" },
      deps({ hitsByQuery: {}, fallbackItems: [scholarlyItem()] }),
    )
    expect(result.papers).toHaveLength(1)
    expect(result.papers[0]?.title).toBe("Fallback Paper")
    expect(result.papers[0]?.provider).toBe("arxiv")
  })

  it("dedupes identical papers across queries by key and normalized title", async () => {
    const queries = ["q1", "q2"]
    const hitsByQuery = {
      q1: [
        hit({ dedupeKey: "10.1/x", paper: paper({ title: "Same Paper!" }) }),
        hit({ dedupeKey: "10.1/y", paper: paper({ title: "Other" }) }),
      ],
      q2: [hit({ dedupeKey: "different-key", paper: paper({ title: "same  paper" }) })],
    }
    const result = await askAgent({ question: "q" }, deps({ queries, hitsByQuery }))
    expect(result.papers.map((p) => p.title)).toEqual(["Same Paper!", "Other"])
  })

  it("injects attached library excerpts and search metadata into the prompt", async () => {
    const d = deps({
      contextDocs: [
        {
          documentId: docId,
          title: "My Library Paper",
          authors: ["Kim"],
          year: 2024,
          excerpt: "우리는 메모리 모듈을 제안한다.",
        },
      ],
    })
    await askAgent({ question: "관련성이 있어?", contextDocIds: [docId] }, d)
    const prompt = d.messages.map((message) => message.content).join("\n")
    expect(prompt).toContain('[L1] "My Library Paper"')
    expect(prompt).toContain("우리는 메모리 모듈을 제안한다.")
    expect(prompt).toContain('[1] "Attention Is All You Need"')
    expect(prompt).toContain("We propose the Transformer architecture.")
  })

  it("passes prior turns through as chat history", async () => {
    const d = deps()
    await askAgent(
      {
        question: "후속 질문",
        history: [
          { role: "user", content: "첫 질문" },
          { role: "assistant", content: "첫 답변" },
        ],
      },
      d,
    )
    expect(d.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ])
    expect(d.messages[1]?.content).toBe("첫 질문")
    expect(d.messages[3]?.content).toContain("후속 질문")
  })

  it("rejects an empty question", async () => {
    await expect(askAgent({ question: "   " }, deps())).rejects.toThrow()
  })

  it("emits explicit step events for plan, search and compose", async () => {
    const steps: AgentStep[] = []
    await askAgent({ question: "q" }, deps({ queries: ["q1", "q2"] }), (step) => steps.push(step))
    const ids = steps.map((step) => `${step.id}:${step.status}`)
    expect(ids.slice(0, 2)).toEqual(["plan:running", "plan:done"])
    expect(ids.slice(-2)).toEqual(["compose:running", "compose:done"])
    expect(ids).toContain("search:0:running")
    expect(ids).toContain("search:0:done")
    expect(ids).toContain("search:1:running")
    expect(ids).toContain("search:1:done")
    expect(ids.indexOf("search:0:running")).toBeLessThan(ids.indexOf("search:0:done"))
    expect(steps[1]?.queries).toEqual(["q1", "q2"])
    expect(steps.find((step) => step.id === "search:0" && step.status === "done")?.found).toBe(1)
  })

  it("marks search steps failed and emits fallback steps when Semantic Scholar is down", async () => {
    const steps: AgentStep[] = []
    await askAgent(
      { question: "q" },
      deps({ queries: ["q1"], paperSearchError: true, fallbackItems: [scholarlyItem()] }),
      (step) => steps.push(step),
    )
    const search = steps.filter((step) => step.kind === "search")
    expect(search[0]?.status).toBe("running")
    expect(search[1]?.status).toBe("failed")
    const fallback = steps.filter((step) => step.kind === "fallback")
    expect(fallback.map((step) => step.status)).toEqual(["running", "done"])
    expect(fallback[1]?.found).toBe(1)
  })
})

describe("planAgentQueries", () => {
  const completionFor = (text: string) => async () => ({ text, model: "m" })

  it("parses planned queries from model JSON", async () => {
    const queries = await planAgentQueries(
      "health flow",
      completionFor('{"queries":["health data flow","cerebral blood flow"]}'),
    )
    expect(queries).toEqual(["health data flow", "cerebral blood flow"])
  })

  it("tolerates prose around the JSON object", async () => {
    const queries = await planAgentQueries(
      "q",
      completionFor('Here you go: {"queries":["only one"]} done'),
    )
    expect(queries).toEqual(["only one"])
  })

  it("falls back to the raw question on invalid JSON or errors", async () => {
    expect(await planAgentQueries("q", completionFor("not json"))).toEqual(["q"])
    expect(
      await planAgentQueries("q", async () => {
        throw new Error("down")
      }),
    ).toEqual(["q"])
  })

  it("rejects plans with more than three queries", async () => {
    const queries = await planAgentQueries("q", completionFor('{"queries":["a","b","c","d"]}'))
    expect(queries).toEqual(["q"])
  })
})
