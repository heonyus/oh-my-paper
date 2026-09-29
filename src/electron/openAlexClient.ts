import { z } from "zod"
import { abstractFromInvertedIndex } from "./citationProviderParsers"
import {
  arxivDoiFor,
  arxivIdFromDoi,
  normalizedArxivId,
  normalizedDoiValue,
  type PaperCandidate,
} from "./paperCandidates"
import {
  httpsUrl,
  PaperSourceError,
  parseJsonBody,
  requestSource,
  sourcePacers,
} from "./paperSourceHttp"
import type { ScholarlyTransport } from "./scholarlySearchTransport"

const OPENALEX_WORKS_URL = "https://api.openalex.org/works"
/** OpenAlex caps semantic search pages at 50 results. */
export const OPENALEX_SEMANTIC_LIMIT = 50
const workFields = [
  "id",
  "doi",
  "title",
  "publication_year",
  "authorships",
  "cited_by_count",
  "primary_location",
  "best_oa_location",
  "abstract_inverted_index",
].join(",")

const locationSchema = z
  .object({
    landing_page_url: z.string().nullable().optional(),
    pdf_url: z.string().nullable().optional(),
    source: z.object({ display_name: z.string().nullable().optional() }).nullable().optional(),
  })
  .nullable()
  .optional()

const workSchema = z.object({
  id: z.string(),
  doi: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  publication_year: z.number().int().nullable().optional(),
  authorships: z
    .array(z.object({ author: z.object({ display_name: z.string().nullable().optional() }) }))
    .default([]),
  cited_by_count: z.number().int().nonnegative().nullable().optional(),
  primary_location: locationSchema,
  best_oa_location: locationSchema,
  abstract_inverted_index: z.record(z.string(), z.array(z.number().int())).nullable().optional(),
})

const worksResponseSchema = z.object({ results: z.array(z.unknown()) })

type OpenAlexOptions = {
  readonly signal?: AbortSignal | undefined
  readonly transport?: ScholarlyTransport | undefined
  readonly apiKey?: string | undefined
}

function shortOpenAlexId(id: string): string {
  return id.replace(/^https?:\/\/openalex\.org\//iu, "")
}

export function parseOpenAlexWork(value: unknown): PaperCandidate | null {
  const parsed = workSchema.safeParse(value)
  if (!parsed.success) return null
  const work = parsed.data
  const title = work.title?.replace(/\s+/gu, " ").trim()
  if (!title) return null
  const doi = normalizedDoiValue(work.doi)
  const landing = httpsUrl(work.primary_location?.landing_page_url)
  const arxivId =
    arxivIdFromDoi(doi) ?? (landing?.includes("arxiv.org/abs/") ? normalizedArxivId(landing) : null)
  return {
    source: "openalex",
    title,
    authors: work.authorships
      .map((authorship) => authorship.author.display_name?.trim() ?? "")
      .filter((name) => name.length > 0),
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name ?? "",
    abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
    landingUrl: landing ?? (doi ? `https://doi.org/${doi}` : null),
    fullTextUrl:
      httpsUrl(work.best_oa_location?.pdf_url) ??
      (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
    citationCount: work.cited_by_count ?? null,
    ids: { doi, arxivId, s2Id: null, openAlexId: shortOpenAlexId(work.id) },
  }
}

function worksUrl(params: Readonly<Record<string, string>>, apiKey: string | undefined): URL {
  const url = new URL(OPENALEX_WORKS_URL)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set("select", workFields)
  if (apiKey) url.searchParams.set("api_key", apiKey)
  return url
}

async function fetchWorks(url: URL, options: OpenAlexOptions): Promise<PaperCandidate[]> {
  const body = await requestSource({
    url,
    pacer: sourcePacers.openalex,
    signal: options.signal,
    transport: options.transport,
  })
  const envelope = worksResponseSchema.safeParse(parseJsonBody(body))
  if (!envelope.success) throw new PaperSourceError("malformed")
  return envelope.data.results
    .map(parseOpenAlexWork)
    .filter((work): work is PaperCandidate => work !== null)
}

function yearFilter(yearFrom: number | null, yearTo: number | null): string | null {
  if (yearFrom !== null && yearTo !== null) return `publication_year:${yearFrom}-${yearTo}`
  if (yearFrom !== null) return `publication_year:>${yearFrom - 1}`
  if (yearTo !== null) return `publication_year:<${yearTo + 1}`
  return null
}

/** Embedding search over titles and abstracts; accepts a natural-language English description. */
export function searchOpenAlexSemantic(
  input: {
    readonly query: string
    readonly limit: number
    readonly yearFrom: number | null
    readonly yearTo: number | null
  },
  options: OpenAlexOptions = {},
): Promise<PaperCandidate[]> {
  const filter = yearFilter(input.yearFrom, input.yearTo)
  return fetchWorks(
    worksUrl(
      {
        "search.semantic": input.query.slice(0, 1_900),
        per_page: String(Math.min(Math.max(input.limit, 1), OPENALEX_SEMANTIC_LIMIT)),
        ...(filter ? { filter } : {}),
      },
      options.apiKey,
    ),
    options,
  )
}

/**
 * Keyword search over titles, abstracts and full text, ranked by OpenAlex relevance. Unlike
 * embedding search it matches exact names, such as a new paper's acronym.
 */
export function searchOpenAlexKeyword(
  input: {
    readonly query: string
    readonly limit: number
    readonly yearFrom: number | null
    readonly yearTo: number | null
  },
  options: OpenAlexOptions = {},
): Promise<PaperCandidate[]> {
  const filter = yearFilter(input.yearFrom, input.yearTo)
  return fetchWorks(
    worksUrl(
      {
        search: input.query.slice(0, 500),
        per_page: String(Math.min(Math.max(input.limit, 1), 50)),
        ...(filter ? { filter } : {}),
      },
      options.apiKey,
    ),
    options,
  )
}

/** OpenAlex reads `|` and `,` inside a filter value as separators, so such DOIs cannot be asked for. */
function filterableDoi(doi: string | null): doi is string {
  return doi !== null && !/[|,]/u.test(doi)
}

/** Works for the given DOIs and arXiv ids in one request (at most 50 identifiers). */
export function openAlexWorksByIds(
  input: { readonly dois: readonly string[]; readonly arxivIds: readonly string[] },
  options: OpenAlexOptions = {},
): Promise<PaperCandidate[]> {
  const dois = [
    ...new Set(
      [
        ...input.dois.map((doi) => normalizedDoiValue(doi)),
        ...input.arxivIds.map((id) => {
          const arxivId = normalizedArxivId(id)
          return arxivId ? arxivDoiFor(arxivId) : null
        }),
      ].filter(filterableDoi),
    ),
  ].slice(0, 50)
  if (dois.length === 0) return Promise.resolve([])
  return fetchWorks(
    worksUrl({ filter: `doi:${dois.join("|")}`, per_page: String(dois.length) }, options.apiKey),
    options,
  )
}

/** Works that cite `openAlexId`, most cited first. */
export function openAlexCitingWorks(
  input: { readonly openAlexId: string; readonly limit: number },
  options: OpenAlexOptions = {},
): Promise<PaperCandidate[]> {
  return fetchWorks(
    worksUrl(
      {
        filter: `cites:${input.openAlexId}`,
        sort: "cited_by_count:desc",
        per_page: String(Math.min(Math.max(input.limit, 1), 50)),
      },
      options.apiKey,
    ),
    options,
  )
}
