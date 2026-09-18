import { describe, expect, it } from "vitest"
import { getScholarlyGraph } from "../../src/electron/scholarlyGraph"
import type { ScholarlyTransportResponse } from "../../src/electron/scholarlySearchTransport"

type Work = {
  readonly id: string
  readonly title: string
  readonly publication_year: number
  readonly doi: string | null
  readonly authorships: readonly { readonly author: { readonly display_name: string } }[]
  readonly cited_by_count: number
  readonly primary_location: { readonly landing_page_url: string }
  readonly abstract_inverted_index: Readonly<Record<string, readonly number[]>> | null
  readonly referenced_works: readonly string[]
  readonly related_works: readonly string[]
  readonly cited_by_api_url: string | null
}

const work = (id: string, title: string): Work => ({
  id: `https://openalex.org/${id}`,
  title,
  publication_year: 2024,
  doi: `https://doi.org/10.1234/${id.toLowerCase()}`,
  authorships: [{ author: { display_name: "A Researcher" } }],
  cited_by_count: 4,
  primary_location: { landing_page_url: `https://example.org/${id}` },
  abstract_inverted_index: { faithful: [1], metadata: [0] },
  referenced_works: [],
  related_works: [],
  cited_by_api_url: null,
})

function response(body: unknown, statusCode = 200): ScholarlyTransportResponse {
  return { statusCode, body: JSON.stringify(body), retryAfterSeconds: null }
}

describe("scholarly graph", () => {
  it("returns real-direction edges and honest per-direction truncation", async () => {
    const seed = {
      ...work("W1", "Seed paper"),
      referenced_works: ["https://openalex.org/W2", "https://openalex.org/W3"],
      related_works: ["https://openalex.org/W4"],
      cited_by_api_url: "https://api.openalex.org/works?filter=cites:W1",
    }
    const transport = async (url: URL): Promise<ScholarlyTransportResponse> => {
      if (url.pathname.endsWith("/W1")) return response(seed)
      const filter = url.searchParams.get("filter") ?? ""
      if (filter.includes("cites:W1")) {
        return response({
          meta: { count: 1 },
          results: [
            { ...work("W5", "Citing paper"), referenced_works: ["https://openalex.org/W1"] },
          ],
        })
      }
      if (filter.includes("W2")) {
        return response({
          meta: { count: 2 },
          results: [
            { ...work("W2", "Reference paper"), referenced_works: ["https://openalex.org/W4"] },
          ],
        })
      }
      return response({ meta: { count: 1 }, results: [work("W4", "Related paper")] })
    }

    const result = await getScholarlyGraph(
      { seed: { openAlexId: "W1" }, directions: ["references", "cited_by", "related"], limit: 4 },
      { transport, signal: new AbortController().signal },
    )

    expect(result.seedIds).toEqual(["https://openalex.org/W1"])
    expect(result.nodes.map(({ id }) => id)).toEqual([
      "https://openalex.org/W1",
      "https://openalex.org/W2",
      "https://openalex.org/W5",
      "https://openalex.org/W4",
    ])
    expect(
      result.edges.map(({ direction, sourceId, targetId }) => ({ direction, sourceId, targetId })),
    ).toEqual([
      {
        direction: "references",
        sourceId: "https://openalex.org/W1",
        targetId: "https://openalex.org/W2",
      },
      {
        direction: "cited_by",
        sourceId: "https://openalex.org/W5",
        targetId: "https://openalex.org/W1",
      },
      {
        direction: "related",
        sourceId: "https://openalex.org/W1",
        targetId: "https://openalex.org/W4",
      },
      {
        direction: "references",
        sourceId: "https://openalex.org/W2",
        targetId: "https://openalex.org/W4",
      },
    ])
    expect(result.directions.find(({ direction }) => direction === "references")?.truncated).toBe(
      true,
    )
    expect(result.truncated).toBe(true)
    expect(result.nodes[0]?.abstract).toBe("metadata faithful")
  })

  it("keeps transient provider failures to one bounded request", async () => {
    let attempts = 0
    const transport = async (): Promise<ScholarlyTransportResponse> => {
      attempts += 1
      return response({}, 503)
    }
    await expect(
      getScholarlyGraph(
        { seed: { openAlexId: "W1" }, directions: ["related"], limit: 1 },
        { transport, signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ kind: "http_error", httpStatus: 503 })
    expect(attempts).toBe(1)
  })

  it("budgets unique neighbors while retaining duplicate directional relations", async () => {
    const seed = {
      ...work("W1", "Seed paper"),
      referenced_works: ["https://openalex.org/W2", "https://openalex.org/W3"],
      cited_by_api_url: "https://api.openalex.org/works?filter=cites:W1",
    }
    const transport = async (url: URL): Promise<ScholarlyTransportResponse> => {
      if (url.pathname.endsWith("/W1")) return response(seed)
      const filter = url.searchParams.get("filter") ?? ""
      if (filter.includes("cites:W1")) {
        return response({
          meta: { count: 2 },
          results: [
            { ...work("W2", "Citing duplicate"), referenced_works: ["https://openalex.org/W1"] },
            work("W4", "Omitted citing paper"),
          ],
        })
      }
      return response({
        meta: { count: 2 },
        results: [
          { ...work("W2", "Reference duplicate"), referenced_works: ["https://openalex.org/W3"] },
          work("W3", "Second reference"),
        ],
      })
    }

    const result = await getScholarlyGraph(
      { seed: { openAlexId: "W1" }, directions: ["references", "cited_by"], limit: 2 },
      { transport, signal: new AbortController().signal },
    )

    expect(result.nodes.map(({ id }) => id)).toEqual([
      "https://openalex.org/W1",
      "https://openalex.org/W2",
      "https://openalex.org/W3",
    ])
    expect(result.directions).toEqual([
      expect.objectContaining({ direction: "references", resultCount: 2, truncated: false }),
      expect.objectContaining({ direction: "cited_by", resultCount: 1, truncated: true }),
    ])
    expect(result.edges.filter(({ direction }) => direction === "cited_by")).toHaveLength(1)
    expect(result.edges).toContainEqual({
      sourceId: "https://openalex.org/W2",
      targetId: "https://openalex.org/W3",
      direction: "references",
      provenance: "openalex",
    })
  })

  it("drops an unmatched canonical work and falls back from an HTTP landing URL", async () => {
    const seed = {
      ...work("W1", "Seed paper"),
      referenced_works: ["https://openalex.org/W2"],
    }
    const transport = async (url: URL): Promise<ScholarlyTransportResponse> => {
      if (url.pathname.endsWith("/W1")) return response(seed)
      return response({
        meta: { count: 2 },
        results: [
          {
            ...work("W2", "Matched paper"),
            primary_location: { landing_page_url: "http://unsafe.example/paper" },
          },
          {
            ...work("W999", "Unmatched provider result"),
          },
        ],
      })
    }

    const result = await getScholarlyGraph(
      { seed: { openAlexId: "W1" }, directions: ["references"], limit: 1 },
      { transport, signal: new AbortController().signal },
    )

    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.find(({ id }) => id.endsWith("/W2"))?.sourceUrl).toBe(
      "https://doi.org/10.1234/w2",
    )
    expect(result.nodes.some(({ id }) => id.endsWith("/W999"))).toBe(false)
    expect(result.directions[0]).toMatchObject({ resultCount: 1, truncated: false })
  })

  it("does not treat an empty or unrelated reference list as cited-by evidence", async () => {
    const seed = {
      ...work("W1", "Seed paper"),
      cited_by_api_url: "https://api.openalex.org/works?filter=cites:W1",
    }
    const transport = async (url: URL): Promise<ScholarlyTransportResponse> => {
      if (url.pathname.endsWith("/W1")) return response(seed)
      return response({
        meta: { count: 2 },
        results: [
          work("W2", "Empty references"),
          { ...work("W3", "Unrelated references"), referenced_works: ["https://openalex.org/W9"] },
        ],
      })
    }

    const result = await getScholarlyGraph(
      { seed: { openAlexId: "W1" }, directions: ["cited_by"], limit: 2 },
      { transport, signal: new AbortController().signal },
    )

    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(0)
    expect(result.directions[0]).toMatchObject({ resultCount: 0, totalResults: 2, truncated: true })
  })
})
