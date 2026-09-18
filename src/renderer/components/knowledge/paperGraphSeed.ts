import {
  type ScholarlySearchItem,
  scholarlySearchItemSchema,
} from "../../../shared/scholarlySearchSchemas"

export function paperGraphSeed(identifier: string): ScholarlySearchItem | null {
  const value = identifier.trim()
  const openAlex = value.match(
    /^(?:https?:\/\/(?:api\.)?openalex\.org\/(?:works\/)?)?(W\d+)\/?$/iu,
  )?.[1]
  const doi = value.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/iu, "")
  if (!openAlex && !/^10\.\d{4,9}\/\S+$/iu.test(doi)) return null
  const openAlexId = openAlex ? `https://openalex.org/${openAlex.toUpperCase()}` : null
  return scholarlySearchItemSchema.parse({
    provider: "openalex",
    identity: {
      providerRecordId: openAlexId ?? doi,
      openAlexId,
      doi: openAlex ? null : doi,
      arxivId: null,
    },
    title: value,
    authors: [],
    year: null,
    venue: "",
    abstract: null,
    landingUrl: null,
    citationCount: null,
    access: {
      metadata: "available",
      abstract: "unavailable",
      fullText: { state: "unavailable", url: null },
    },
  })
}
