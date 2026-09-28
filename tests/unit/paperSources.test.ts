// @vitest-environment node

import { describe, expect, it } from "vitest"
import { arxivSearchQuery, searchArxiv } from "../../src/electron/arxivClient"
import { parseOpenAlexWork } from "../../src/electron/openAlexClient"
import { CandidatePool, type PaperCandidate } from "../../src/electron/paperCandidates"
import { PaperSourceError, RequestPacer, requestSource } from "../../src/electron/paperSourceHttp"
import type { ScholarlyTransport } from "../../src/electron/scholarlySearchTransport"
import {
  parseSemanticScholarPaper,
  semanticScholarRef,
} from "../../src/electron/semanticScholarClient"

function candidate(overrides: Partial<PaperCandidate>): PaperCandidate {
  return {
    source: "arxiv",
    title: "Parametric Memory for Long Documents",
    authors: [],
    year: 2025,
    venue: "",
    abstract: null,
    landingUrl: null,
    fullTextUrl: null,
    citationCount: null,
    ids: { doi: null, arxivId: null, s2Id: null, openAlexId: null },
    ...overrides,
  }
}

describe("arxivSearchQuery", () => {
  it("requires each meaningful term instead of one exact sentence", () => {
    expect(arxivSearchQuery("how to make LLM remember long documents")).toBe(
      "all:make AND all:llm AND all:remember AND all:long AND all:documents",
    )
  })

  it("keeps quoted phrases and adds the submitted-date window", () => {
    expect(arxivSearchQuery('"test-time training" long context', 2024, null)).toBe(
      'all:"test-time training" AND all:long AND all:context AND submittedDate:[202401010000 TO 999912312359]',
    )
  })

  it("returns null when nothing searchable remains", () => {
    expect(arxivSearchQuery("the of and")).toBeNull()
  })

  it("parses Atom entries into candidates with arXiv identities", async () => {
    const urls: URL[] = []
    const transport: ScholarlyTransport = async (url) => {
      urls.push(url)
      return {
        statusCode: 200,
        retryAfterSeconds: null,
        body: [
          '<feed xmlns="http://www.w3.org/2005/Atom"><entry>',
          "<id>http://arxiv.org/abs/2501.01234v2</id><title>Memory\n Layers</title>",
          "<published>2025-01-02T00:00:00Z</published><author><name>A. Kim</name></author>",
          "<summary> Stores documents. </summary></entry></feed>",
        ].join(""),
      }
    }
    const results = await searchArxiv(
      { query: "memory layers", limit: 5, yearFrom: null, yearTo: null },
      { transport },
    )
    expect(urls[0]?.searchParams.get("search_query")).toBe("all:memory AND all:layers")
    expect(results).toEqual([
      expect.objectContaining({
        title: "Memory Layers",
        abstract: "Stores documents.",
        fullTextUrl: "https://arxiv.org/pdf/2501.01234",
        ids: expect.objectContaining({ arxivId: "2501.01234" }),
      }),
    ])
  })
})

describe("OpenAlex and Semantic Scholar parsing", () => {
  it("rebuilds OpenAlex abstracts and recognises arXiv DOIs", () => {
    const parsed = parseOpenAlexWork({
      id: "https://openalex.org/W42",
      doi: "https://doi.org/10.48550/arXiv.2401.00001",
      title: "Memory  Tokens",
      publication_year: 2024,
      authorships: [{ author: { display_name: "B. Lee" } }],
      cited_by_count: 7,
      primary_location: { landing_page_url: null, source: { display_name: "arXiv" } },
      best_oa_location: null,
      abstract_inverted_index: { tokens: [1], Memory: [0], help: [2] },
    })
    expect(parsed).toMatchObject({
      title: "Memory Tokens",
      abstract: "Memory tokens help",
      landingUrl: "https://doi.org/10.48550/arxiv.2401.00001",
      fullTextUrl: "https://arxiv.org/pdf/2401.00001",
      ids: { arxivId: "2401.00001", openAlexId: "W42" },
    })
  })

  it("maps Semantic Scholar papers and prefers stable references", () => {
    const parsed = parseSemanticScholarPaper({
      paperId: "abc",
      title: "Knowledge Modules",
      authors: [{ name: "C. Park" }],
      year: 2025,
      externalIds: { ArXiv: "2503.00002", DOI: "10.1/x" },
      openAccessPdf: null,
      citationCount: 3,
    })
    expect(parsed).toMatchObject({
      landingUrl: "https://arxiv.org/abs/2503.00002",
      fullTextUrl: "https://arxiv.org/pdf/2503.00002",
      ids: { s2Id: "abc", arxivId: "2503.00002", doi: "10.1/x" },
    })
    expect(
      semanticScholarRef(
        candidate({ ids: { doi: "10.1/y", arxivId: null, s2Id: null, openAlexId: null } }),
      ),
    ).toBe("DOI:10.1/y")
    expect(
      semanticScholarRef(
        candidate({
          ids: { doi: "10.48550/arxiv.2401.12345", arxivId: null, s2Id: null, openAlexId: null },
        }),
      ),
    ).toBe("arXiv:2401.12345")
  })
})

describe("CandidatePool", () => {
  it("merges records that share any identifier or title and keeps richer fields", () => {
    const pool = new CandidatePool()
    const first = pool.add([
      candidate({ ids: { doi: "10.1/a", arxivId: null, s2Id: null, openAlexId: null } }),
    ])
    const second = pool.add([
      candidate({
        title: "Different Title Entirely Here",
        abstract: "longer abstract",
        citationCount: 12,
        ids: { doi: "10.1/a", arxivId: "2501.1", s2Id: "s2", openAlexId: null },
      }),
      candidate({ title: "parametric memory for long documents!", source: "openalex" }),
    ])
    expect(first).toEqual(["p1"])
    expect(second).toEqual([])
    expect(pool.size).toBe(1)
    expect(pool.get("p1")).toMatchObject({
      abstract: "longer abstract",
      citationCount: 12,
      ids: { arxivId: "2501.1", s2Id: "s2" },
    })
  })
})

describe("requestSource", () => {
  it("retries once after a 429 and then succeeds", async () => {
    const statuses = [429, 200]
    const transport: ScholarlyTransport = async () => ({
      statusCode: statuses.shift() ?? 500,
      retryAfterSeconds: 0,
      body: "ok",
    })
    await expect(
      requestSource({ url: new URL("https://example.org"), pacer: new RequestPacer(0), transport }),
    ).resolves.toBe("ok")
  })

  it("reports a persistent rate limit as a typed source error", async () => {
    const transport: ScholarlyTransport = async () => ({
      statusCode: 429,
      retryAfterSeconds: 0,
      body: "",
    })
    await expect(
      requestSource({ url: new URL("https://example.org"), pacer: new RequestPacer(0), transport }),
    ).rejects.toMatchObject(new PaperSourceError("rate_limited", 429))
  })

  it("spaces request starts on the same pacer", async () => {
    const pacer = new RequestPacer(40)
    const starts: number[] = []
    await Promise.all(
      [1, 2, 3].map(() =>
        pacer.run(async () => {
          starts.push(Date.now())
        }),
      ),
    )
    expect((starts[2] ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(75)
  })
})
