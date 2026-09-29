// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
  arxivSearchQuery,
  fetchArxivAbstract,
  parseArxivAbstractPage,
  queryTerms,
  searchArxiv,
} from "../../src/electron/arxivClient"
import { dataCiteQuery, searchDataCite } from "../../src/electron/dataCiteClient"
import {
  openAlexWorksByIds,
  parseOpenAlexWork,
  searchOpenAlexKeyword,
} from "../../src/electron/openAlexClient"
import { CandidatePool, displayName, type PaperCandidate } from "../../src/electron/paperCandidates"
import { createPaperDiscoverySources } from "../../src/electron/paperDiscoverySources"
import { PaperSourceError, RequestPacer, requestSource } from "../../src/electron/paperSourceHttp"
import type { ScholarlyTransport } from "../../src/electron/scholarlySearchTransport"
import {
  parseSemanticScholarPaper,
  semanticScholarRef,
} from "../../src/electron/semanticScholarClient"
import { createWebPaperSearch, paperIdentifiers } from "../../src/electron/webPaperSource"
import {
  createSearxngEngine,
  parseSearxngHits,
  searxngBaseUrl,
} from "../../src/electron/webSearchEngines"

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
    ).rejects.toMatchObject({ kind: "rate_limited", httpStatus: 429, retryAfterSeconds: 0 })
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

function jsonTransport(body: unknown, urls: URL[] = []): ScholarlyTransport {
  return async (url) => {
    urls.push(url)
    return { statusCode: 200, retryAfterSeconds: null, body: JSON.stringify(body) }
  }
}

describe("query terms and DataCite", () => {
  it("keeps quoted phrases and drops stop words", () => {
    expect(queryTerms('"test-time training" How to Scale')).toEqual({
      phrases: ["test-time training"],
      words: ["scale"],
    })
  })

  it("builds a DataCite query without field operators", () => {
    expect(dataCiteQuery("MedRSI: Recursive Self-Improvement")).toBe(
      "(medrsi recursive self improvement)",
    )
    expect(dataCiteQuery('"medical agents" benchmark', 2024, null)).toBe(
      '("medical agents" benchmark) AND publicationYear:[2024 TO *]',
    )
    expect(dataCiteQuery("the of")).toBeNull()
  })

  it("flips catalogue-style names", () => {
    expect(displayName("Wu, Junde")).toBe("Junde Wu")
    expect(displayName("Plain Name")).toBe("Plain Name")
  })

  it("maps DataCite arXiv records to candidates and drops other records", async () => {
    const urls: URL[] = []
    const transport = jsonTransport(
      {
        data: [
          {
            id: "10.48550/arxiv.2609.24838",
            attributes: {
              titles: [{ title: "MedRSI:  Recursive Self-Improvement" }],
              creators: [
                { name: "Wu, Junde", givenName: "Junde", familyName: "Wu" },
                { name: "Zhu, Jiayuan" },
              ],
              publicationYear: 2026,
              descriptions: [
                { description: "Medical agents  learn.", descriptionType: "Abstract" },
              ],
            },
          },
          { id: "10.5281/zenodo.1", attributes: { titles: [{ title: "A dataset" }] } },
        ],
      },
      urls,
    )
    const results = await searchDataCite(
      { query: "MedRSI", limit: 5, yearFrom: null, yearTo: 2026 },
      { transport },
    )
    expect(urls[0]?.searchParams.get("query")).toBe("(medrsi) AND publicationYear:[* TO 2026]")
    expect(urls[0]?.searchParams.get("client-id")).toBe("arxiv.content")
    expect(results).toEqual([
      expect.objectContaining({
        source: "arxiv",
        title: "MedRSI: Recursive Self-Improvement",
        authors: ["Junde Wu", "Jiayuan Zhu"],
        year: 2026,
        abstract: "Medical agents learn.",
        landingUrl: "https://arxiv.org/abs/2609.24838",
        ids: expect.objectContaining({ doi: "10.48550/arxiv.2609.24838", arxivId: "2609.24838" }),
      }),
    ])
  })
})

describe("OpenAlex keyword search and identifier lookup", () => {
  it("sends the keyword query with a year filter", async () => {
    const urls: URL[] = []
    await searchOpenAlexKeyword(
      { query: "MedRSI", limit: 10, yearFrom: 2025, yearTo: null },
      { transport: jsonTransport({ results: [] }, urls) },
    )
    expect(urls[0]?.searchParams.get("search")).toBe("MedRSI")
    expect(urls[0]?.searchParams.get("filter")).toBe("publication_year:>2024")
  })

  it("asks for DOIs and arXiv ids in one request and skips unusable ids", async () => {
    const urls: URL[] = []
    await openAlexWorksByIds(
      {
        dois: ["https://doi.org/10.1145/3292500.3330919", "10.1/a|b"],
        arxivIds: ["2609.24838v1", "nonsense"],
      },
      { transport: jsonTransport({ results: [] }, urls) },
    )
    expect(urls).toHaveLength(1)
    expect(urls[0]?.searchParams.get("filter")).toBe(
      "doi:10.1145/3292500.3330919|10.48550/arxiv.2609.24838",
    )
  })

  it("makes no request without identifiers", async () => {
    const urls: URL[] = []
    await expect(
      openAlexWorksByIds({ dois: [], arxivIds: [] }, { transport: jsonTransport({}, urls) }),
    ).resolves.toEqual([])
    expect(urls).toHaveLength(0)
  })
})

describe("arXiv abstract pages", () => {
  const html = [
    '<html><head><meta name="citation_title" content="Memory &amp; Layers" />',
    '<meta name="citation_author" content="Kim, A." />',
    '<meta name="citation_author" content="Lee, B." />',
    '<meta name="citation_date" content="2025/01/02" />',
    '<meta name="citation_arxiv_id" content="2501.01234" />',
    '<meta name="citation_abstract" content="Stores  documents &#x26; more." />',
    "</head></html>",
  ].join("")

  it("reads a paper from the citation meta tags", () => {
    expect(parseArxivAbstractPage(html)).toMatchObject({
      source: "arxiv",
      title: "Memory & Layers",
      authors: ["A. Kim", "B. Lee"],
      year: 2025,
      abstract: "Stores documents & more.",
      landingUrl: "https://arxiv.org/abs/2501.01234",
      ids: { arxivId: "2501.01234" },
    })
    expect(parseArxivAbstractPage("<html></html>", "2501.01234")).toBeNull()
  })

  it("fetches the abstract page by normalized id", async () => {
    const urls: URL[] = []
    const transport: ScholarlyTransport = async (url) => {
      urls.push(url)
      return { statusCode: 200, retryAfterSeconds: null, body: html }
    }
    const paper = await fetchArxivAbstract("https://arxiv.org/abs/2501.01234v2", { transport })
    expect(urls[0]?.href).toBe("https://arxiv.org/abs/2501.01234")
    expect(paper?.title).toBe("Memory & Layers")
  })
})

describe("SearXNG engine", () => {
  it("accepts instance urls without credentials, queries or fragments", () => {
    expect(searxngBaseUrl(" https://searx.example.org ")?.href).toBe("https://searx.example.org/")
    expect(searxngBaseUrl("http://localhost:8080/searxng")?.href).toBe(
      "http://localhost:8080/searxng/",
    )
    expect(searxngBaseUrl("ftp://host")).toBeNull()
    expect(searxngBaseUrl("https://user:pw@host")).toBeNull()
    expect(searxngBaseUrl("https://host/?format=json")).toBeNull()
    expect(searxngBaseUrl("")).toBeNull()
    expect(searxngBaseUrl(undefined)).toBeNull()
  })

  it("requests json results and keeps titled http hits in order", async () => {
    const urls: URL[] = []
    const transport = jsonTransport(
      {
        results: [
          { title: " MedRSI ", url: "https://arxiv.org/abs/2609.24838", content: "A  paper" },
          { title: "", url: "https://untitled.example" },
          { title: "Not web", url: "ftp://host/file" },
          { title: "Second", url: "http://example.org/two", content: null },
        ],
      },
      urls,
    )
    const engine = createSearxngEngine(new URL("https://host/searxng/"), { transport })
    const hits = await engine.search("MedRSI", 5)
    expect(urls[0]?.href).toBe(
      "https://host/searxng/search?q=MedRSI&format=json&language=en&categories=general%2Cscience&safesearch=0",
    )
    expect(hits).toEqual([
      { title: "MedRSI", url: "https://arxiv.org/abs/2609.24838", snippet: "A paper" },
      { title: "Second", url: "http://example.org/two", snippet: null },
    ])
    expect(() => parseSearxngHits({ results: "nope" })).toThrow(PaperSourceError)
  })
})

describe("web hits as paper records", () => {
  const hit = (url: string, snippet: string | null = null, title = "A page title here") => ({
    title,
    url,
    snippet,
  })

  it("finds arXiv ids and DOIs in result urls and text", () => {
    expect(paperIdentifiers(hit("https://arxiv.org/abs/2609.24838v1"))).toEqual({
      arxivId: "2609.24838",
      doi: null,
    })
    expect(paperIdentifiers(hit("https://arxiv.org/pdf/2609.24838v2.pdf"))).toEqual({
      arxivId: "2609.24838",
      doi: null,
    })
    expect(paperIdentifiers(hit("https://arxiv.org/abs/hep-th/9901001"))).toEqual({
      arxivId: "hep-th/9901001",
      doi: null,
    })
    expect(paperIdentifiers(hit("https://huggingface.co/papers/2609.24838"))).toEqual({
      arxivId: "2609.24838",
      doi: null,
    })
    expect(paperIdentifiers(hit("https://doi.org/10.48550/arXiv.2609.24838"))).toEqual({
      arxivId: "2609.24838",
      doi: "10.48550/arxiv.2609.24838",
    })
    expect(paperIdentifiers(hit("https://dl.acm.org/doi/pdf/10.1145/3292500.3330919"))).toEqual({
      arxivId: null,
      doi: "10.1145/3292500.3330919",
    })
    expect(
      paperIdentifiers(hit("https://www.biorxiv.org/content/10.1101/2024.01.01.573621v1.full.pdf")),
    ).toEqual({ arxivId: null, doi: "10.1101/2024.01.01.573621" })
    expect(
      paperIdentifiers(hit("https://example.com/post/1234.56789", "see arXiv:2501.00001 here")),
    ).toEqual({ arxivId: "2501.00001", doi: null })
    expect(paperIdentifiers(hit("https://example.com/2024.05/notes"))).toEqual({
      arxivId: null,
      doi: null,
    })
    expect(paperIdentifiers(hit("not a url"))).toEqual({ arxivId: null, doi: null })
  })

  it("resolves hits through the index, arXiv pages and title matches, in hit order", async () => {
    const engine = {
      label: "test",
      search: async () => [
        hit(
          "https://arxiv.org/abs/2609.24838",
          null,
          "[2609.24838] MedRSI: Recursive Self-Improvement",
        ),
        hit("https://arxiv.org/abs/2609.99999", null, "Fresh preprint"),
        hit(
          "https://dl.acm.org/doi/10.1145/3292500.3330919",
          null,
          "Learning Dynamic Context Graphs",
        ),
        hit(
          "https://en.wikipedia.org/wiki/Attention_Is_All_You_Need",
          null,
          "Attention Is All You Need - Wikipedia",
        ),
        hit("https://blog.example.com/agents", null, "Some blog post about agents"),
        hit("https://example.com/short", null, "Short"),
        hit("https://arxiv.org/abs/2609.24838", null, "MedRSI again (duplicate)"),
      ],
    }
    const calls: string[] = []
    const search = createWebPaperSearch(engine, {
      byIds: async (ids) => {
        calls.push(`ids:${ids.arxivIds.join(",")}|${ids.dois.join(",")}`)
        return [
          candidate({
            source: "openalex",
            title: "MedRSI: Recursive Self-Improvement",
            year: 2026,
            ids: { doi: "10.48550/arxiv.2609.24838", arxivId: null, s2Id: null, openAlexId: "W1" },
          }),
          candidate({
            source: "openalex",
            title: "Learning Dynamic Context Graphs for Predicting Social Events",
            year: 2019,
            ids: { doi: "10.1145/3292500.3330919", arxivId: null, s2Id: null, openAlexId: "W2" },
          }),
        ]
      },
      arxivAbstract: async (id) => {
        calls.push(`abs:${id}`)
        return candidate({
          title: "Fresh preprint from arXiv",
          year: 2026,
          ids: { doi: null, arxivId: id, s2Id: null, openAlexId: null },
        })
      },
      byTitle: async (title) => {
        calls.push(`title:${title}`)
        return title.includes("Attention")
          ? [
              candidate({
                source: "openalex",
                title: "Attention Is All You Need",
                year: 2017,
                ids: {
                  doi: "10.48550/arxiv.1706.03762",
                  arxivId: null,
                  s2Id: null,
                  openAlexId: "W3",
                },
              }),
            ]
          : [candidate({ title: "An unrelated record about something else", year: 2024 })]
      },
    })
    const papers = await search({ query: "medrsi", limit: 10, yearFrom: 2018, yearTo: null })
    expect(calls).toEqual([
      "ids:2609.24838,2609.99999|10.1145/3292500.3330919",
      "abs:2609.99999",
      "title:Attention Is All You Need - Wikipedia",
      "title:Some blog post about agents",
    ])
    expect(papers.map((paper) => paper.title)).toEqual([
      "MedRSI: Recursive Self-Improvement",
      "Fresh preprint from arXiv",
      "Learning Dynamic Context Graphs for Predicting Social Events",
    ])
  })

  it("survives a failing resolver call and stops on cancellation", async () => {
    const engine = {
      label: "test",
      search: async () => [hit("https://arxiv.org/abs/2609.99999", null, "Fresh preprint")],
    }
    const failing = createWebPaperSearch(engine, {
      byIds: async () => [],
      arxivAbstract: async () => {
        throw new PaperSourceError("http_error", 404)
      },
      byTitle: async () => [],
    })
    await expect(failing({ query: "q", limit: 5, yearFrom: null, yearTo: null })).resolves.toEqual(
      [],
    )
    const controller = new AbortController()
    const cancelled = createWebPaperSearch(engine, {
      byIds: async () => [],
      arxivAbstract: async () => {
        controller.abort()
        throw new PaperSourceError("network")
      },
      byTitle: async () => [],
    })
    await expect(
      cancelled({ query: "q", limit: 5, yearFrom: null, yearTo: null }, controller.signal),
    ).rejects.toThrow()
  })
})

describe("createPaperDiscoverySources", () => {
  it("adds the keyless keyword sources and a web source only when SearXNG is configured", () => {
    const labels = (env: Record<string, string>) =>
      createPaperDiscoverySources(env).keyword.map((source) => source.label)
    expect(labels({})).toEqual(["arXiv", "Semantic Scholar", "OpenAlex 키워드", "DataCite(arXiv)"])
    expect(labels({ OH_MY_PAPER_SEARXNG_URL: "https://searx.example.org" })).toEqual([
      "arXiv",
      "Semantic Scholar",
      "OpenAlex 키워드",
      "DataCite(arXiv)",
      "웹(SearXNG)",
    ])
    expect(labels({ OH_MY_PAPER_SEARXNG_URL: "not a url" })).toHaveLength(4)
  })

  it("exposes the web fallback only when an engine is supplied", () => {
    const engine = { label: "웹(Claude)", search: async () => [] }
    expect(createPaperDiscoverySources({}, { fallbackEngine: engine }).fallback?.label).toBe(
      "웹(Claude)",
    )
    expect(createPaperDiscoverySources({}).fallback).toBeNull()
  })
})
