import { request } from "undici"
import {
  type CitationLookupRequest,
  type CitationLookupResult,
  type CitationPaper,
  citationLookupRequestSchema,
  citationLookupResultSchema,
} from "../shared/ipc"
import { selectCitationGraphPaper, selectCitationPaper } from "./citationMatching"
import {
  parseArxivPapers,
  parseArxivXml,
  parseCrossrefPapers,
  parseJson,
  parseOpenAlexPapers,
  parsePapers,
  parseReferencePapers,
} from "./citationProviderParsers"

type TransportResponse = { readonly statusCode: number; readonly body: string }
export type Transport = (url: string) => Promise<TransportResponse>
type Provider = "semantic_scholar" | "crossref" | "arxiv" | "openalex" | "reference_graph"

export type CitationProviderFailure = {
  readonly provider: Provider
  readonly kind: "http_error" | "malformed_response" | "transport_error"
  readonly httpStatus: number | null
}

export class CitationLookupProvidersError extends Error {
  readonly name = "CitationLookupProvidersError"

  constructor(readonly failures: readonly CitationProviderFailure[]) {
    super(`Citation lookup incomplete: ${failures.map(({ provider }) => provider).join(", ")}`)
  }
}

function buildQuery(input: CitationLookupRequest): string | null {
  if (input.doi) return input.doi
  const parts = [input.title, input.authors, input.year ? String(input.year) : undefined].filter(
    (part): part is string => Boolean(part),
  )
  if (parts.length > 0) return parts.join(" ")
  return (
    input.context
      ?.replace(/\[[^\]]+\]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim() || null
  )
}

async function defaultTransport(url: string): Promise<TransportResponse> {
  const response = await request(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": url.includes("openalex.org")
        ? "Scourgify/0.1 (https://github.com/heonyus/scourgify)"
        : "Scourgify/0.1",
    },
    headersTimeout: 5_000,
    bodyTimeout: 5_000,
  })
  return { statusCode: response.statusCode, body: await response.body.text() }
}

async function fetchPapers(
  provider: Provider,
  url: string,
  parse: (body: string) => readonly CitationPaper[],
  transport: Transport,
  failures: CitationProviderFailure[],
): Promise<readonly CitationPaper[]> {
  try {
    const response = await transport(url)
    if (response.statusCode < 200 || response.statusCode >= 300) {
      failures.push({ provider, kind: "http_error", httpStatus: response.statusCode })
      return []
    }
    return parse(response.body)
  } catch (error) {
    failures.push({
      provider,
      kind: error instanceof SyntaxError ? "malformed_response" : "transport_error",
      httpStatus: null,
    })
    return []
  }
}

function requiredJson(body: string): unknown {
  const value = parseJson(body)
  if (value === null) throw new SyntaxError("Malformed provider JSON")
  return value
}

function requiredArxiv(body: string): unknown {
  if (!body.includes("<feed") || !body.includes("</feed>")) {
    throw new SyntaxError("Malformed arXiv feed")
  }
  return parseArxivXml(body)
}

function found(
  match: ReturnType<typeof selectCitationPaper>,
  query: string,
): CitationLookupResult | null {
  if (!match) return null
  return citationLookupResultSchema.parse({
    status: "found",
    paper: match.paper,
    match: {
      score: match.score,
      signals: match.signals,
      candidatesCompared: match.candidatesCompared,
    },
    query,
  })
}

export async function lookupCitation(
  input: CitationLookupRequest,
  transport: Transport = defaultTransport,
): Promise<CitationLookupResult> {
  const citation = citationLookupRequestSchema.parse(input)
  const query = buildQuery(citation)
  if (!query) {
    return citationLookupResultSchema.parse({
      status: "not_found",
      paper: null,
      query: citation.key,
    })
  }
  const failures: CitationProviderFailure[] = []
  const semanticParams = new URLSearchParams({
    query,
    limit: "3",
    fields: "paperId,title,authors,year,venue,abstract,externalIds,url,openAccessPdf,citationCount",
  })
  const semantic = await fetchPapers(
    "semantic_scholar",
    `https://api.semanticscholar.org/graph/v1/paper/search?${semanticParams.toString()}`,
    (body) => parsePapers(requiredJson(body)),
    transport,
    failures,
  )
  const semanticMatch = found(selectCitationPaper(semantic, citation), query)
  if (semanticMatch) return semanticMatch

  const crossrefParams = new URLSearchParams({ rows: "3" })
  if (citation.title) crossrefParams.set("query.title", citation.title)
  if (citation.authors) crossrefParams.set("query.author", citation.authors)
  if (!citation.title && !citation.authors) crossrefParams.set("query.bibliographic", query)
  if (citation.year) {
    crossrefParams.set(
      "filter",
      `from-pub-date:${citation.year}-01-01,until-pub-date:${citation.year}-12-31`,
    )
  }
  crossrefParams.set(
    "select",
    "DOI,title,author,published,container-title,abstract,URL,is-referenced-by-count",
  )
  const crossref = await fetchPapers(
    "crossref",
    `https://api.crossref.org/works?${crossrefParams.toString()}`,
    (body) => parseCrossrefPapers(requiredJson(body)),
    transport,
    failures,
  )
  const crossrefMatch = found(selectCitationPaper(crossref, citation), query)
  if (crossrefMatch) return crossrefMatch

  const arxivQuery = citation.title ? `ti:"${citation.title.slice(0, 180)}"` : query
  const arxiv = await fetchPapers(
    "arxiv",
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(arxivQuery)}&max_results=3`,
    (body) => parseArxivPapers(requiredArxiv(body)),
    transport,
    failures,
  )
  const arxivMatch = found(selectCitationPaper(arxiv, citation), query)
  if (arxivMatch) return arxivMatch

  const openAlexParams = new URLSearchParams({
    search: query.slice(0, 300),
    per_page: "3",
    select: "id,title,publication_year,doi,authorships,cited_by_count,primary_location",
  })
  const openAlex = await fetchPapers(
    "openalex",
    `https://api.openalex.org/works?${openAlexParams.toString()}`,
    (body) => parseOpenAlexPapers(requiredJson(body)),
    transport,
    failures,
  )
  const openAlexMatch = found(selectCitationPaper(openAlex, citation), query)
  if (openAlexMatch) return openAlexMatch

  if (citation.currentPaperTitle) {
    const currentParams = new URLSearchParams({
      query: citation.currentPaperTitle,
      limit: "3",
      fields: "paperId,title,authors,year",
    })
    const current = await fetchPapers(
      "reference_graph",
      `https://api.semanticscholar.org/graph/v1/paper/search?${currentParams.toString()}`,
      (body) => parsePapers(requiredJson(body)),
      transport,
      failures,
    )
    const currentMatch = selectCitationPaper(current, {
      key: "current-paper",
      title: citation.currentPaperTitle,
    })
    if (currentMatch) {
      const referenceParams = new URLSearchParams({
        limit: "1000",
        fields:
          "paperId,title,authors,year,venue,abstract,externalIds,url,openAccessPdf,citationCount",
      })
      const references = await fetchPapers(
        "reference_graph",
        `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(currentMatch.paper.paperId)}/references?${referenceParams.toString()}`,
        (body) => parseReferencePapers(requiredJson(body)),
        transport,
        failures,
      )
      const match = selectCitationGraphPaper(references, citation)
      if (match) {
        return citationLookupResultSchema.parse({
          status: "found",
          paper: match.paper,
          match,
          query,
        })
      }
    }
  }
  if (failures.length > 0) throw new CitationLookupProvidersError(failures)
  return citationLookupResultSchema.parse({ status: "not_found", paper: null, query })
}
