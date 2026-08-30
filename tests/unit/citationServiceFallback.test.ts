import { describe, expect, it } from "vitest"
import { lookupCitation } from "../../src/electron/citationService"

describe("lookupCitation fallbacks", () => {
  it("falls back to arXiv when Semantic Scholar and Crossref fail", async () => {
    const arxivXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<feed>",
      "<entry>",
      "<id>http://arxiv.org/abs/2308.08155v3</id>",
      "<title>AutoGen: Enabling Next-Gen LLM Applications via",
      "  Multi-Agent Conversation</title>",
      "<published>2023-08-16T00:00:00Z</published>",
      "<author><name>Qingyun Wu</name></author>",
      "<author><name>Gagan Bansal</name></author>",
      "<summary>AutoGen framework.</summary>",
      "</entry>",
      "</feed>",
    ].join("\n")
    const result = await lookupCitation(
      {
        key: "wu-2023",
        title: "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation",
      },
      async (url) =>
        url.includes("semanticscholar")
          ? { statusCode: 429, body: "rate limited" }
          : url.includes("crossref")
            ? { statusCode: 200, body: JSON.stringify({ message: { items: [] } }) }
            : { statusCode: 200, body: arxivXml },
    )
    expect(result.status).toBe("found")
    if (result.status === "found") {
      expect(result.paper.title).toContain("AutoGen")
      expect(result.paper.year).toBe(2023)
      expect(result.paper.url).toBe("https://arxiv.org/abs/2308.08155v3")
      expect(result.paper.openAccessUrl).toBe("https://arxiv.org/abs/2308.08155v3")
    }
  })

  it("falls back to OpenAlex when earlier sources fail", async () => {
    const result = await lookupCitation(
      { key: "mandel-2016", title: "SMART on FHIR standards platform", authors: "Mandel" },
      async (url) =>
        url.includes("semanticscholar")
          ? { statusCode: 429, body: "rate limited" }
          : url.includes("crossref")
            ? { statusCode: 200, body: JSON.stringify({ message: { items: [] } }) }
            : url.includes("arxiv.org")
              ? { statusCode: 200, body: "<feed></feed>" }
              : {
                  statusCode: 200,
                  body: JSON.stringify({
                    results: [
                      {
                        id: "https://openalex.org/W123",
                        title: "SMART on FHIR standards platform paper",
                        publication_year: 2016,
                        doi: "https://doi.org/10.1093/jamia/ocv189",
                        authorships: [{ author: { display_name: "Jonathan M Mandel" } }],
                        cited_by_count: 500,
                        primary_location: { source: { display_name: "JAMIA" } },
                      },
                    ],
                  }),
                },
    )
    expect(result.status).toBe("found")
    if (result.status === "found") {
      expect(result.paper.doi).toBe("10.1093/jamia/ocv189")
      expect(result.paper.venue).toBe("JAMIA")
    }
  })

  it("resolves a malformed local title from the current paper reference graph", async () => {
    const result = await lookupCitation(
      {
        key: "guo-2025",
        title: "DPO-14B MedCopilot-14B GRPO Figure 16 qualitative comparison",
        authors: "Guo et al.",
        year: 2025,
        currentPaperTitle: "MedAgentGym: Scalable Training of LLM Agents",
      },
      async (url) => {
        const parsed = new URL(url)
        const query = parsed.searchParams.get("query")
        if (parsed.pathname.endsWith("/paper/search") && query?.startsWith("MedAgentGym")) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              data: [
                {
                  paperId: "current-paper",
                  title: "MedAgentGym: Scalable Training of LLM Agents",
                  authors: [{ name: "Current Author" }],
                  year: 2026,
                },
              ],
            }),
          }
        }
        if (parsed.pathname.endsWith("/paper/current-paper/references")) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              data: [
                {
                  citedPaper: {
                    paperId: "cited-paper",
                    title: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs",
                    authors: [{ name: "Daya Guo" }],
                    year: 2025,
                    venue: "arXiv",
                    abstract: "A reasoning model paper.",
                    externalIds: { DOI: "10.48550/arXiv.2501.12948" },
                    url: "https://www.semanticscholar.org/paper/cited-paper",
                    citationCount: 100,
                  },
                },
              ],
            }),
          }
        }
        if (parsed.hostname.includes("crossref")) {
          return { statusCode: 200, body: JSON.stringify({ message: { items: [] } }) }
        }
        if (parsed.hostname.includes("arxiv")) return { statusCode: 200, body: "<feed></feed>" }
        if (parsed.hostname.includes("openalex")) {
          return { statusCode: 200, body: JSON.stringify({ results: [] }) }
        }
        return { statusCode: 200, body: JSON.stringify({ data: [] }) }
      },
    )

    expect(result.status).toBe("found")
    if (result.status === "found") {
      expect(result.paper.paperId).toBe("cited-paper")
      expect(result.match.signals).toContain("current-paper reference graph")
    }
  })
})
