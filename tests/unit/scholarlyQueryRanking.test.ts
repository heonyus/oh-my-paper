import { describe, expect, it } from "vitest"
import { queryTerms, rankForUserQuery } from "../../src/renderer/lib/scholarlyQueryRanking"
import type { ScholarlySearchItem } from "../../src/shared/scholarlySearchSchemas"

function item(title: string, overrides: Partial<ScholarlySearchItem> = {}): ScholarlySearchItem {
  return {
    provider: "arxiv",
    identity: { providerRecordId: title, doi: null, arxivId: null, openAlexId: null },
    title,
    authors: [],
    year: 2025,
    venue: "arXiv",
    abstract: null,
    landingUrl: null,
    citationCount: null,
    access: {
      metadata: "available",
      abstract: "unavailable",
      fullText: { state: "unavailable", url: null },
    },
    ...overrides,
  }
}

const openDocument = { title: "The Open Paper", doi: "10.1/open" }

describe("rankForUserQuery", () => {
  it("keeps two-syllable Korean terms and drops filler words", () => {
    expect(queryTerms("긴 문서 기억 논문 찾아줘 LLM")).toEqual(["문서", "기억", "llm"])
  })

  it("keeps results without word overlap and ranks matching titles first", () => {
    const ranked = rankForUserQuery(
      "parametric memory",
      [
        item("Storing documents in weights", { provider: "openalex" }),
        item("Parametric memory layers"),
      ],
      openDocument,
    )
    expect(ranked.map(({ item: result }) => result.title)).toEqual([
      "Parametric memory layers",
      "Storing documents in weights",
    ])
    expect(ranked[0]?.reasons).toEqual(["검색어 일치: parametric, memory"])
    expect(ranked[1]?.reasons).toEqual(["의미 기반 검색 결과"])
  })

  it("excludes the open paper and duplicate records", () => {
    const ranked = rankForUserQuery(
      "memory",
      [
        item("The Open Paper"),
        item("Memory A", {
          identity: { providerRecordId: "1", doi: "10.1/a", arxivId: null, openAlexId: null },
        }),
        item("Memory A (copy)", {
          identity: { providerRecordId: "2", doi: "10.1/A", arxivId: null, openAlexId: null },
        }),
      ],
      openDocument,
    )
    expect(ranked.map(({ item: result }) => result.title)).toEqual(["Memory A"])
  })
})
