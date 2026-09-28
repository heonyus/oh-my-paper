import { z } from "zod"
import {
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

const S2_GRAPH_URL = "https://api.semanticscholar.org/graph/v1"
const S2_RECOMMENDATIONS_URL = "https://api.semanticscholar.org/recommendations/v1/papers"
const S2_FIELDS =
  "paperId,title,abstract,authors,year,venue,externalIds,openAccessPdf,citationCount"

const s2PaperSchema = z.object({
  paperId: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  abstract: z.string().nullable().optional(),
  authors: z.array(z.object({ name: z.string().nullable().optional() })).default([]),
  year: z.number().int().nullable().optional(),
  venue: z.string().nullable().optional(),
  externalIds: z
    .object({ DOI: z.string().optional(), ArXiv: z.string().optional() })
    .nullable()
    .optional(),
  openAccessPdf: z.object({ url: z.string().nullable().optional() }).nullable().optional(),
  citationCount: z.number().int().nonnegative().nullable().optional(),
})

const searchResponseSchema = z.object({ data: z.array(z.unknown()).default([]) })
const referencesResponseSchema = z.object({
  data: z.array(z.object({ citedPaper: z.unknown() })).default([]),
})
const citationsResponseSchema = z.object({
  data: z.array(z.object({ citingPaper: z.unknown() })).default([]),
})
const recommendationsResponseSchema = z.object({ recommendedPapers: z.array(z.unknown()) })

type S2Options = {
  readonly signal?: AbortSignal | undefined
  readonly transport?: ScholarlyTransport | undefined
  readonly apiKey?: string | undefined
}

export function parseSemanticScholarPaper(value: unknown): PaperCandidate | null {
  const parsed = s2PaperSchema.safeParse(value)
  if (!parsed.success) return null
  const paper = parsed.data
  const title = paper.title?.replace(/\s+/gu, " ").trim()
  if (!title || !paper.paperId) return null
  const doi = normalizedDoiValue(paper.externalIds?.DOI)
  const arxivId = normalizedArxivId(paper.externalIds?.ArXiv) ?? arxivIdFromDoi(doi)
  return {
    source: "semanticscholar",
    title,
    authors: paper.authors
      .map((author) => author.name?.trim() ?? "")
      .filter((name) => name.length > 0),
    year: paper.year ?? null,
    venue: paper.venue ?? "",
    abstract: paper.abstract ?? null,
    landingUrl: arxivId
      ? `https://arxiv.org/abs/${arxivId}`
      : doi
        ? `https://doi.org/${doi}`
        : `https://www.semanticscholar.org/paper/${paper.paperId}`,
    fullTextUrl:
      httpsUrl(paper.openAccessPdf?.url) ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
    citationCount: paper.citationCount ?? null,
    ids: { doi, arxivId, s2Id: paper.paperId, openAlexId: null },
  }
}

/** The identifier Semantic Scholar resolves for a candidate, if any. */
export function semanticScholarRef(candidate: PaperCandidate): string | null {
  const { s2Id, arxivId, doi } = candidate.ids
  if (s2Id) return s2Id
  const arxiv = arxivId ?? arxivIdFromDoi(doi)
  if (arxiv) return `arXiv:${arxiv}`
  return doi ? `DOI:${doi}` : null
}

function papersFrom(values: readonly unknown[]): PaperCandidate[] {
  return values
    .map(parseSemanticScholarPaper)
    .filter((paper): paper is PaperCandidate => paper !== null)
}

async function requestJson(
  url: URL,
  options: S2Options,
  body?: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const headers: Record<string, string> = options.apiKey ? { "x-api-key": options.apiKey } : {}
  const text = await requestSource({
    url,
    pacer: sourcePacers.semanticscholar,
    signal: options.signal,
    transport: options.transport,
    retries: options.apiKey ? 2 : 1,
    init: body
      ? {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : { headers },
  })
  return parseJsonBody(text)
}

function yearRange(yearFrom: number | null, yearTo: number | null): string | null {
  if (yearFrom === null && yearTo === null) return null
  return `${yearFrom ?? ""}-${yearTo ?? ""}`
}

/** Relevance-ranked keyword search. Keyless access shares a public pool that is often throttled. */
export async function searchSemanticScholar(
  input: {
    readonly query: string
    readonly limit: number
    readonly yearFrom: number | null
    readonly yearTo: number | null
  },
  options: S2Options = {},
): Promise<PaperCandidate[]> {
  const url = new URL(`${S2_GRAPH_URL}/paper/search`)
  url.searchParams.set("query", input.query.slice(0, 300))
  url.searchParams.set("limit", String(Math.min(Math.max(input.limit, 1), 50)))
  url.searchParams.set("fields", S2_FIELDS)
  const years = yearRange(input.yearFrom, input.yearTo)
  if (years) url.searchParams.set("year", years)
  const envelope = searchResponseSchema.safeParse(await requestJson(url, options))
  if (!envelope.success) throw new PaperSourceError("malformed")
  return papersFrom(envelope.data.data)
}

/** Papers the given paper cites. */
export async function semanticScholarReferences(
  input: { readonly paperRef: string; readonly limit: number },
  options: S2Options = {},
): Promise<PaperCandidate[]> {
  const url = new URL(`${S2_GRAPH_URL}/paper/${encodeURIComponent(input.paperRef)}/references`)
  url.searchParams.set("limit", String(Math.min(Math.max(input.limit, 1), 100)))
  url.searchParams.set("fields", S2_FIELDS)
  const envelope = referencesResponseSchema.safeParse(await requestJson(url, options))
  if (!envelope.success) throw new PaperSourceError("malformed")
  return papersFrom(envelope.data.data.map(({ citedPaper }) => citedPaper))
}

/** Papers that cite the given paper. */
export async function semanticScholarCitations(
  input: { readonly paperRef: string; readonly limit: number },
  options: S2Options = {},
): Promise<PaperCandidate[]> {
  const url = new URL(`${S2_GRAPH_URL}/paper/${encodeURIComponent(input.paperRef)}/citations`)
  url.searchParams.set("limit", String(Math.min(Math.max(input.limit, 1), 100)))
  url.searchParams.set("fields", S2_FIELDS)
  const envelope = citationsResponseSchema.safeParse(await requestJson(url, options))
  if (!envelope.success) throw new PaperSourceError("malformed")
  return papersFrom(envelope.data.data.map(({ citingPaper }) => citingPaper))
}

/** Papers Semantic Scholar recommends for a set of positive examples. */
export async function semanticScholarRecommendations(
  input: { readonly positiveRefs: readonly string[]; readonly limit: number },
  options: S2Options = {},
): Promise<PaperCandidate[]> {
  const url = new URL(S2_RECOMMENDATIONS_URL)
  url.searchParams.set("limit", String(Math.min(Math.max(input.limit, 1), 100)))
  url.searchParams.set("fields", S2_FIELDS)
  const envelope = recommendationsResponseSchema.safeParse(
    await requestJson(url, options, { positivePaperIds: input.positiveRefs.slice(0, 10) }),
  )
  if (!envelope.success) throw new PaperSourceError("malformed")
  return papersFrom(envelope.data.recommendedPapers)
}
