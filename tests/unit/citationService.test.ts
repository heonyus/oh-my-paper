import { lookupCitation } from "../../src/electron/citationService"

describe("lookupCitation", () => {
  it("returns the first structured Semantic Scholar match", async () => {
    const result = await lookupCitation(
      { key: "[12]", title: "A paper about memory", authors: "Doe", year: 2024 },
      async () => ({
        statusCode: 200,
        body: JSON.stringify({
          data: [
            {
              paperId: "paper-1",
              title: "A paper about memory",
              authors: [{ name: "Jane Doe" }],
              year: 2024,
              venue: "KDD",
              abstract: "An abstract.",
              externalIds: { DOI: "10.1234/example" },
              url: "https://www.semanticscholar.org/paper/paper-1",
              openAccessPdf: { url: "https://example.org/paper.pdf" },
              citationCount: 7,
            },
          ],
        }),
      }),
    )

    expect(result.status).toBe("found")
    if (result.status === "found") {
      expect(result.paper.title).toBe("A paper about memory")
      expect(result.paper.doi).toBe("10.1234/example")
      expect(result.paper.openAccessUrl).toBe("https://example.org/paper.pdf")
      expect(result.match.score).toBeGreaterThan(0.9)
    }
  })

  it("returns not_found without a searchable citation identity", async () => {
    const result = await lookupCitation({ key: "[99]" }, async () => {
      throw new Error("transport must not be called")
    })

    expect(result).toEqual({ status: "not_found", paper: null, query: "[99]" })
  })

  it("fails closed for malformed or unavailable responses", async () => {
    const result = await lookupCitation({ key: "[1]", title: "Unknown paper" }, async () => ({
      statusCode: 503,
      body: "unavailable",
    }))

    expect(result.status).toBe("not_found")
    expect(result.paper).toBeNull()
  })

  it("fails closed when Semantic Scholar returns malformed JSON", async () => {
    const result = await lookupCitation({ key: "[1]", title: "Unknown paper" }, async () => ({
      statusCode: 200,
      body: "not-json",
    }))

    expect(result).toEqual({ status: "not_found", paper: null, query: "Unknown paper" })
  })

  it("falls back to Crossref when Semantic Scholar is rate limited", async () => {
    const result = await lookupCitation(
      { key: "Vaswani-2017", title: "Attention Is All You Need" },
      async (url) =>
        url.includes("semanticscholar")
          ? { statusCode: 429, body: "rate limited" }
          : {
              statusCode: 200,
              body: JSON.stringify({
                message: {
                  items: [
                    {
                      DOI: "10.5555/3295222.3295349",
                      title: ["Attention Is All You Need"],
                      author: [{ given: "Ashish", family: "Vaswani" }],
                      published: { "date-parts": [[2017]] },
                      "container-title": ["NeurIPS"],
                      URL: "https://doi.org/10.5555/3295222.3295349",
                      "is-referenced-by-count": 100,
                    },
                  ],
                },
              }),
            },
    )

    expect(result.status).toBe("found")
    if (result.status === "found") {
      expect(result.paper.title).toBe("Attention Is All You Need")
      expect(result.paper.authors).toEqual(["Ashish Vaswani"])
    }
  })

  it("selects the verified title match instead of the first search result", async () => {
    const result = await lookupCitation(
      { key: "[3]", title: "Target Clinical Agent Paper", authors: "Kim", year: 2025 },
      async () => ({
        statusCode: 200,
        body: JSON.stringify({
          data: [
            {
              paperId: "wrong",
              title: "Unrelated Language Model Survey",
              authors: [{ name: "Someone Else" }],
              year: 2025,
            },
            {
              paperId: "correct",
              title: "Target Clinical Agent Paper",
              authors: [{ name: "Jin Kim" }],
              year: 2025,
            },
          ],
        }),
      }),
    )

    expect(result.status).toBe("found")
    if (result.status === "found") {
      expect(result.paper.paperId).toBe("correct")
      expect(result.match.candidatesCompared).toBe(2)
    }
  })
})
