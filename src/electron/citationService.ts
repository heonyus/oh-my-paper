import { request } from "undici"
import {
  type CitationLookupRequest,
  type CitationLookupResult,
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

type TransportResponse = {
  readonly statusCode: number
  readonly body: string
}

export type Transport = (url: string) => Promise<TransportResponse>

function buildQuery(request: CitationLookupRequest): string | null {
  if (request.doi) return request.doi
  const parts = [
    request.title,
    request.authors,
    request.year ? String(request.year) : undefined,
  ].filter((part): part is string => Boolean(part))
  if (parts.length > 0) return parts.join(" ")
  return (
    request.context
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

export async function lookupCitation(
  input: CitationLookupRequest,
  transport: Transport = defaultTransport,
): Promise<CitationLookupResult> {
  const parsedRequest = citationLookupRequestSchema.parse(input)
  const query = buildQuery(parsedRequest)
  if (!query)
    return citationLookupResultSchema.parse({
      status: "not_found",
      paper: null,
      query: parsedRequest.key,
    })

  const params = new URLSearchParams({
    query,
    limit: "3",
    fields: "paperId,title,authors,year,venue,abstract,externalIds,url,openAccessPdf,citationCount",
  })
  try {
    const response = await transport(
      `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
    )
    if (response.statusCode >= 200 && response.statusCode < 300) {
      const match = selectCitationPaper(parsePapers(parseJson(response.body)), parsedRequest)
      if (match) {
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
    }
    const crossrefParams = new URLSearchParams({ rows: "3" })
    if (parsedRequest.title) crossrefParams.set("query.title", parsedRequest.title)
    if (parsedRequest.authors) crossrefParams.set("query.author", parsedRequest.authors)
    if (!parsedRequest.title && !parsedRequest.authors) {
      crossrefParams.set("query.bibliographic", query)
    }
    if (parsedRequest.year) {
      crossrefParams.set(
        "filter",
        `from-pub-date:${parsedRequest.year}-01-01,until-pub-date:${parsedRequest.year}-12-31`,
      )
    }
    crossrefParams.set(
      "select",
      "DOI,title,author,published,container-title,abstract,URL,is-referenced-by-count",
    )
    const crossref = await transport(`https://api.crossref.org/works?${crossrefParams.toString()}`)
    if (crossref.statusCode >= 200 && crossref.statusCode < 300) {
      const match = selectCitationPaper(
        parseCrossrefPapers(parseJson(crossref.body)),
        parsedRequest,
      )
      if (match) {
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
    }
    const arxivQuery = parsedRequest.title ? `ti:"${parsedRequest.title.slice(0, 180)}"` : query
    const arxiv = await transport(
      `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(arxivQuery)}&max_results=3`,
    )
    if (arxiv.statusCode >= 200 && arxiv.statusCode < 300) {
      const match = selectCitationPaper(parseArxivPapers(parseArxivXml(arxiv.body)), parsedRequest)
      if (match) {
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
    }
    const openAlexParams = new URLSearchParams({
      search: query.slice(0, 300),
      per_page: "3",
      select: "id,title,publication_year,doi,authorships,cited_by_count,primary_location",
    })
    const openAlex = await transport(`https://api.openalex.org/works?${openAlexParams.toString()}`)
    if (openAlex.statusCode >= 200 && openAlex.statusCode < 300) {
      const match = selectCitationPaper(
        parseOpenAlexPapers(parseJson(openAlex.body)),
        parsedRequest,
      )
      if (match) {
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
    }
    if (parsedRequest.currentPaperTitle) {
      const currentParams = new URLSearchParams({
        query: parsedRequest.currentPaperTitle,
        limit: "3",
        fields: "paperId,title,authors,year",
      })
      const currentResponse = await transport(
        `https://api.semanticscholar.org/graph/v1/paper/search?${currentParams.toString()}`,
      )
      if (currentResponse.statusCode >= 200 && currentResponse.statusCode < 300) {
        const currentMatch = selectCitationPaper(parsePapers(parseJson(currentResponse.body)), {
          key: "current-paper",
          title: parsedRequest.currentPaperTitle,
        })
        if (currentMatch) {
          const referenceParams = new URLSearchParams({
            limit: "1000",
            fields:
              "paperId,title,authors,year,venue,abstract,externalIds,url,openAccessPdf,citationCount",
          })
          const references = await transport(
            `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(currentMatch.paper.paperId)}/references?${referenceParams.toString()}`,
          )
          if (references.statusCode >= 200 && references.statusCode < 300) {
            const match = selectCitationGraphPaper(
              parseReferencePapers(parseJson(references.body)),
              parsedRequest,
            )
            if (match) {
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
          }
        }
      }
    }
    return citationLookupResultSchema.parse({ status: "not_found", paper: null, query })
  } catch (error) {
    if (error instanceof Error) {
      return citationLookupResultSchema.parse({ status: "not_found", paper: null, query })
    }
    throw error
  }
}
