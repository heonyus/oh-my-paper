// @vitest-environment node
import { describe, expect, it } from "vitest"
import { type ScholarlyTransport, searchScholarly } from "../../../src/electron/scholarlySearch"
import {
  createScholarlyTransport,
  SCHOLARLY_REQUEST_TIMEOUT_MS,
  ScholarlyTransportError,
  type ScholarlyWire,
} from "../../../src/electron/scholarlySearchTransport"

const crossrefBody = JSON.stringify({
  message: {
    "total-results": 1,
    items: [
      {
        DOI: "10.1000/Example",
        title: ["A grounded result"],
        author: [{ given: "Ada", family: "Lovelace" }],
        published: { "date-parts": [[2024]] },
        "container-title": ["Journal"],
        abstract: "<jats:p>Evidence.</jats:p>",
        URL: "https://doi.org/10.1000/example",
      },
    ],
  },
})

const openAlexBody = JSON.stringify({
  meta: { count: 1 },
  results: [
    {
      id: "https://openalex.org/W123",
      title: "An indexed result",
      publication_year: 2023,
      doi: "https://doi.org/10.1000/Example",
      authorships: [{ author: { display_name: "Grace Hopper" } }],
      cited_by_count: 3,
      primary_location: { source: { display_name: "Archive" } },
    },
  ],
})

describe("scholarly search", () => {
  it("keeps successful results when one provider is rate limited", async () => {
    // Given
    let active = 0
    let maximumActive = 0
    const urls: URL[] = []
    const transport: ScholarlyTransport = async (url) => {
      urls.push(url)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active -= 1
      if (url.hostname === "api.crossref.org") {
        return { statusCode: 200, body: crossrefBody, retryAfterSeconds: null }
      }
      if (url.hostname === "export.arxiv.org") {
        return { statusCode: 429, body: "limited", retryAfterSeconds: 30 }
      }
      return { statusCode: 200, body: openAlexBody, retryAfterSeconds: null }
    }

    // When
    const result = await searchScholarly(
      {
        query: "private synthetic query",
        filters: { fromYear: 2020, toYear: 2026 },
        page: 2,
        pageSize: 25,
      },
      { transport },
    )

    // Then
    expect(result.status).toBe("partial")
    expect(result.results.map(({ provider }) => provider)).toEqual(["crossref", "openalex"])
    expect(result.results[0]?.identity.doi).toBe("10.1000/example")
    expect(result.results.map(({ title }) => title)).toEqual([
      "A grounded result",
      "An indexed result",
    ])
    expect(result.providers.find(({ provider }) => provider === "arxiv")).toMatchObject({
      status: "error",
      error: { kind: "rate_limited", retryAfterSeconds: 30 },
    })
    expect(maximumActive).toBe(2)
    expect(
      urls.find(({ hostname }) => hostname === "api.crossref.org")?.searchParams.get("offset"),
    ).toBe("25")
    expect(
      urls.find(({ hostname }) => hostname === "api.crossref.org")?.searchParams.get("filter"),
    ).toBe("from-pub-date:2020-01-01,until-pub-date:2026-12-31")
    expect(
      urls.find(({ hostname }) => hostname === "api.openalex.org")?.searchParams.get("filter"),
    ).toBe("from_publication_date:2020-01-01,to_publication_date:2026-12-31")
    expect(urls.some((url) => url.searchParams.has("api_key"))).toBe(false)
    expect(urls.every((url) => !url.pathname.includes("/pdf"))).toBe(true)
  })

  it("reports each provider as it starts and finishes, then the merged page", async () => {
    // Given
    const transport: ScholarlyTransport = async (url) => {
      await Promise.resolve()
      if (url.hostname === "api.crossref.org") {
        return { statusCode: 200, body: crossrefBody, retryAfterSeconds: null }
      }
      if (url.hostname === "export.arxiv.org") {
        return { statusCode: 429, body: "limited", retryAfterSeconds: 30 }
      }
      return { statusCode: 200, body: openAlexBody, retryAfterSeconds: null }
    }
    const steps: string[] = []

    // When
    const result = await searchScholarly(
      { query: "progress" },
      {
        transport,
        onStep: (step) =>
          steps.push(
            `${step.id}:${step.status}${step.found === undefined ? "" : `:${step.found}`}${
              step.detail ? `:${step.detail}` : ""
            }`,
          ),
      },
    )

    // Then
    expect(result.status).toBe("partial")
    expect(steps).toEqual([
      "provider-crossref:running",
      "provider-arxiv:running",
      "provider-crossref:done:1",
      "provider-arxiv:failed:rate_limited",
      "provider-openalex:running",
      "provider-openalex:done:1",
      "merge:done:2",
    ])
  })

  it("reports timeout without turning it into zero results", async () => {
    // Given
    const transport: ScholarlyTransport = async () => {
      throw new ScholarlyTransportError("timeout")
    }

    // When
    const result = await searchScholarly({ query: "timeout" }, { transport })

    // Then
    expect(result.status).toBe("failed")
    expect(result.providers.every((state) => state.status === "error")).toBe(true)
    expect(result.providers.map((state) => state.status === "error" && state.error.kind)).toEqual([
      "timeout",
      "timeout",
      "timeout",
    ])
  })

  it("enforces the response body byte limit on the wire", async () => {
    // Given
    const wire: ScholarlyWire = async () => ({
      statusCode: 200,
      retryAfter: null,
      body: (async function* () {
        yield new TextEncoder().encode("12345")
        yield new TextEncoder().encode("67890")
      })(),
    })
    const transport = createScholarlyTransport({ wire, timeoutMs: 15_000, maxBodyBytes: 8 })

    // When
    const operation = transport(new URL("https://api.crossref.org/works"))

    // Then
    await expect(operation).rejects.toMatchObject({ kind: "oversized" })
  })

  it("enforces a 15 second production timeout at the wire boundary", async () => {
    // Given
    const wire: ScholarlyWire = ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        })
      })
    const transport = createScholarlyTransport({ wire, timeoutMs: 1 })

    // When
    const operation = transport(new URL("https://api.openalex.org/works"))

    // Then
    expect(SCHOLARLY_REQUEST_TIMEOUT_MS).toBe(15_000)
    await expect(operation).rejects.toMatchObject({ kind: "timeout" })
  })

  it("distinguishes malformed metadata from a valid zero-result page", async () => {
    // Given
    const malformed: ScholarlyTransport = async () => ({
      statusCode: 200,
      body: "{}",
      retryAfterSeconds: null,
    })
    const empty: ScholarlyTransport = async () => ({
      statusCode: 200,
      body: JSON.stringify({ message: { "total-results": 0, items: [] } }),
      retryAfterSeconds: null,
    })

    // When
    const malformedResult = await searchScholarly(
      { query: "malformed", providers: ["crossref"] },
      { transport: malformed },
    )
    const emptyResult = await searchScholarly(
      { query: "empty", providers: ["crossref"] },
      { transport: empty },
    )

    // Then
    expect(malformedResult).toMatchObject({
      status: "failed",
      providers: [{ status: "error", error: { kind: "malformed_response" } }],
    })
    expect(emptyResult).toMatchObject({
      status: "complete",
      results: [],
      providers: [{ status: "success", resultCount: 0, totalResults: 0 }],
    })
  })

  it("preserves the versioned arXiv identity and open access state", async () => {
    // Given
    const body = [
      "<feed>",
      "<opensearch:totalResults>1</opensearch:totalResults>",
      "<entry>",
      "<id>http://arxiv.org/abs/2308.08155v3</id>",
      "<title>Versioned preprint</title>",
      "<published>2023-08-16T00:00:00Z</published>",
      "<author><name>Researcher</name></author>",
      "<summary>Abstract text.</summary>",
      "</entry>",
      "</feed>",
    ].join("")
    const transport: ScholarlyTransport = async () => ({
      statusCode: 200,
      body,
      retryAfterSeconds: null,
    })

    // When
    const result = await searchScholarly(
      { query: "versioned", providers: ["arxiv"] },
      { transport },
    )

    // Then
    expect(result.results[0]).toMatchObject({
      identity: { arxivId: "2308.08155v3" },
      access: { abstract: "available", fullText: { state: "open" } },
    })
  })

  it("cancels remaining providers without dispatching another request", async () => {
    // Given
    const controller = new AbortController()
    let calls = 0
    const transport: ScholarlyTransport = async () => {
      calls += 1
      controller.abort()
      throw new ScholarlyTransportError("cancelled")
    }

    // When
    const result = await searchScholarly(
      { query: "cancelled" },
      { transport, signal: controller.signal },
    )

    // Then
    expect(result.status).toBe("cancelled")
    expect(calls).toBe(2)
    expect(result.providers).toHaveLength(3)
  })
})
