import { describe, expect, it } from "vitest"
import { lookupCitation } from "../../src/electron/citationService"

describe("lookupCitation fallbacks", () => {
  it("falls back to arXiv when Semantic Scholar and Crossref fail", async () => {
    const arxivXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<feed>",
      "<entry>",
      "<id>https://arxiv.org/abs/2308.08155v3</id>",
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
})
