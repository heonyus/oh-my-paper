import { describe, expect, it } from "vitest"
import {
  rankScholarlyRecommendations,
  scholarlyQueryForDocument,
} from "../../src/renderer/lib/scholarlySearchRelevance"
import { documentRecordSchema } from "../../src/shared/schemas"
import type { ScholarlySearchItem } from "../../src/shared/scholarlySearchSchemas"

const document = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "1706050100-upload.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 12,
  title: "Attention Is All You Need",
  authors: ["Ashish Vaswani"],
  year: 2017,
  doi: "10.5555/current",
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

function item(overrides: Partial<ScholarlySearchItem>): ScholarlySearchItem {
  return {
    provider: "openalex",
    identity: {
      providerRecordId: "W1",
      doi: null,
      arxivId: null,
      openAlexId: "W1",
    },
    title: "Attention memory study",
    authors: ["Researcher"],
    year: 2024,
    venue: "Journal",
    abstract: "A study of attention and memory.",
    landingUrl: "https://example.org/paper",
    citationCount: 3,
    access: {
      metadata: "available",
      abstract: "available",
      fullText: { state: "unavailable", url: null },
    },
    ...overrides,
  }
}

describe("scholarly search relevance", () => {
  it("uses the confirmed title or DOI and never a temporary upload filename", () => {
    expect(scholarlyQueryForDocument(document)).toBe("Attention Is All You Need")
    expect(
      scholarlyQueryForDocument({ ...document, title: "1706050100-upload", doi: null }, []),
    ).toBeNull()
  })

  it("filters the current paper and unrelated provider results with explainable reasons", () => {
    const recommendations = rankScholarlyRecommendations(
      document,
      [],
      [
        item({
          title: "Attention Is All You Need",
          identity: { ...item({}).identity, doi: "10.5555/current" },
        }),
        item({ title: "An unrelated astronomy survey", abstract: "Stars and galaxies." }),
        item({ title: "Attention memory study" }),
      ],
    )

    expect(recommendations).toHaveLength(1)
    expect(recommendations[0]?.item.title).toBe("Attention memory study")
    expect(recommendations[0]?.reasons.join(" ")).toContain("제목 핵심어")
  })

  it("uses scientific overview terms and rejects a single generic bridge match", () => {
    const topicDocument = documentRecordSchema.parse({
      ...document,
      name: "1706050100-upload.pdf",
      title: "1706050100-upload References Figure 3",
      doi: null,
      overview: "Neural machine translation uses encoder decoder attention mechanisms.",
    })
    const query = scholarlyQueryForDocument(topicDocument, [
      {
        key: "1",
        title: "A long reference title",
        authors: "Author",
        year: 2020,
        venue: "",
        rawText: "",
        doi: null,
        contexts: [],
      },
      {
        key: "2",
        title: "Another long reference title",
        authors: "Author",
        year: 2021,
        venue: "",
        rawText: "",
        doi: null,
        contexts: [],
      },
    ])
    const recommendations = rankScholarlyRecommendations(
      topicDocument,
      [],
      [
        item({
          title:
            "Bridging the Gap Between Human Language and Machine Logic: A Technical Overview of BinaryCodeConverter.com for Multi-Base Data Translation",
          abstract: "A technical overview of binary conversion.",
        }),
        item({
          title: "Neural machine translation with encoder decoder attention",
          abstract: "We study attention mechanisms for translation.",
        }),
        item({
          title:
            "Deep Learning for Load Forecasting: Sequence to Sequence Recurrent Neural Networks With Attention",
          abstract: "We forecast electrical load from historical measurements.",
        }),
        item({
          title: "Predicting Copper Reactions Using a Recurrent Neural Network with Self-Attention",
          abstract: "We predict chemical reaction feasibility.",
        }),
      ],
    )

    expect(query).toContain("neural")
    expect(query).toContain("translation")
    expect(query).not.toContain("A long reference title")
    expect(recommendations.map(({ item: result }) => result.title)).toEqual([
      "Neural machine translation with encoder decoder attention",
    ])
  })

  it("does not use one-off PDF permission boilerplate as the default topic query", () => {
    const topicDocument = documentRecordSchema.parse({
      ...document,
      title: "1706050100-upload",
      doi: null,
      overview:
        "arXiv Google Research author@google.com. " +
        "Provided proper attribution Google grants permission to reproduce tables. " +
        "The Transformer uses attention for sequence translation. " +
        "Attention connects the encoder and decoder for translation at Google. " +
        "Multi-head attention improves translation quality.",
    })

    const query = scholarlyQueryForDocument(topicDocument, [])

    expect(query).toContain("attention")
    expect(query).toContain("translation")
    expect(query).not.toContain("provided")
    expect(query).not.toContain("permission")
    expect(query).not.toContain("arxiv")
    expect(query).not.toContain("google")
    expect(query).not.toContain("com")
  })
})
