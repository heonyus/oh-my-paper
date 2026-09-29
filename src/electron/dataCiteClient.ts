import { z } from "zod"
import { queryTerms } from "./arxivClient"
import {
  arxivIdFromDoi,
  displayName,
  normalizedDoiValue,
  type PaperCandidate,
} from "./paperCandidates"
import { PaperSourceError, parseJsonBody, requestSource, sourcePacers } from "./paperSourceHttp"
import type { ScholarlyTransport } from "./scholarlySearchTransport"

const DATACITE_DOIS_URL = "https://api.datacite.org/dois"
/** The DataCite client under which arXiv registers a DOI for every paper. */
const ARXIV_CLIENT_ID = "arxiv.content"
const maxTerms = 8

const creatorSchema = z.object({
  name: z.string().nullable().optional(),
  givenName: z.string().nullable().optional(),
  familyName: z.string().nullable().optional(),
})

const doiSchema = z.object({
  id: z.string(),
  attributes: z.object({
    titles: z.array(z.object({ title: z.string().nullable().optional() })).default([]),
    creators: z.array(creatorSchema).default([]),
    publicationYear: z.number().int().nullable().optional(),
    descriptions: z
      .array(
        z.object({
          description: z.string().nullable().optional(),
          descriptionType: z.string().nullable().optional(),
        }),
      )
      .default([]),
  }),
})

const responseSchema = z.object({ data: z.array(z.unknown()).default([]) })

/**
 * A DataCite query-string search limited to plain terms. Colons and other operators would be
 * read as field syntax and match nothing; every term is required.
 */
export function dataCiteQuery(
  query: string,
  yearFrom: number | null = null,
  yearTo: number | null = null,
): string | null {
  const { phrases, words } = queryTerms(query)
  const terms = [
    ...new Set([
      ...phrases
        .map((phrase) => phrase.replace(/["\\]/gu, " ").replace(/\s+/gu, " ").trim())
        .filter((phrase) => phrase.length > 1)
        .map((phrase) => `"${phrase}"`),
      ...words.flatMap((word) => word.split("-")).filter((word) => word.length > 1),
    ]),
  ].slice(0, maxTerms)
  if (terms.length === 0) return null
  const text = `(${terms.join(" ")})`
  if (yearFrom === null && yearTo === null) return text
  return `${text} AND publicationYear:[${yearFrom ?? "*"} TO ${yearTo ?? "*"}]`
}

function creatorName(creator: z.infer<typeof creatorSchema>): string {
  const given = creator.givenName?.trim() ?? ""
  const family = creator.familyName?.trim() ?? ""
  if (given && family) return `${given} ${family}`
  return displayName(creator.name ?? "")
}

/** An arXiv paper from one DataCite DOI record; records without an arXiv id are dropped. */
export function parseDataCiteDoi(value: unknown): PaperCandidate | null {
  const parsed = doiSchema.safeParse(value)
  if (!parsed.success) return null
  const { id, attributes } = parsed.data
  const title = attributes.titles
    .map((entry) => entry.title?.replace(/\s+/gu, " ").trim() ?? "")
    .find((entry) => entry.length > 0)
  const doi = normalizedDoiValue(id)
  const arxivId = arxivIdFromDoi(doi)
  if (!title || !doi || !arxivId) return null
  const abstract =
    attributes.descriptions.find((entry) => entry.descriptionType?.toLowerCase() === "abstract") ??
    attributes.descriptions[0]
  return {
    source: "arxiv",
    title,
    authors: attributes.creators.map(creatorName).filter((name) => name.length > 0),
    year: attributes.publicationYear ?? null,
    venue: "arXiv",
    abstract: abstract?.description?.replace(/\s+/gu, " ").trim() || null,
    landingUrl: `https://arxiv.org/abs/${arxivId}`,
    fullTextUrl: `https://arxiv.org/pdf/${arxivId}`,
    citationCount: null,
    ids: { doi, arxivId, s2Id: null, openAlexId: null },
  }
}

/**
 * arXiv papers by keyword through DataCite, which indexes every arXiv DOI with its title,
 * authors and abstract within hours of submission and is not subject to the arXiv API's limits.
 */
export async function searchDataCite(
  input: {
    readonly query: string
    readonly limit: number
    readonly yearFrom: number | null
    readonly yearTo: number | null
  },
  options: {
    readonly signal?: AbortSignal | undefined
    readonly transport?: ScholarlyTransport | undefined
  } = {},
): Promise<PaperCandidate[]> {
  const query = dataCiteQuery(input.query, input.yearFrom, input.yearTo)
  if (query === null) return []
  const url = new URL(DATACITE_DOIS_URL)
  url.searchParams.set("query", query)
  url.searchParams.set("client-id", ARXIV_CLIENT_ID)
  url.searchParams.set("page[size]", String(Math.min(Math.max(input.limit, 1), 50)))
  url.searchParams.set("sort", "relevance")
  const body = await requestSource({
    url,
    pacer: sourcePacers.datacite,
    signal: options.signal,
    transport: options.transport,
  })
  const envelope = responseSchema.safeParse(parseJsonBody(body))
  if (!envelope.success) throw new PaperSourceError("malformed")
  return envelope.data.data
    .map(parseDataCiteDoi)
    .filter((paper): paper is PaperCandidate => paper !== null)
}
