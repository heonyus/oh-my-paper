import { request } from "undici"
import { z } from "zod"
import {
  type CitationLookupRequest,
  type CitationLookupResult,
  type CitationPaper,
  citationLookupRequestSchema,
  citationLookupResultSchema,
  citationPaperSchema,
} from "../shared/ipc"
import { selectCitationPaper } from "./citationMatching"

type TransportResponse = {
  readonly statusCode: number
  readonly body: string
}

type Transport = (url: string) => Promise<TransportResponse>
const rawPaperSchema = z.object({
  paperId: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.object({ name: z.string().min(1).nullable().optional() })).default([]),
  year: z.number().int().nullable().optional(),
  venue: z.string().optional(),
  abstract: z.string().nullable().optional(),
  externalIds: z.object({ DOI: z.string().min(1).nullable().optional() }).optional(),
  url: z.string().url().nullable().optional(),
  openAccessPdf: z.object({ url: z.string().url().nullable().optional() }).nullable().optional(),
  citationCount: z.number().int().nonnegative().nullable().optional(),
})
const semanticScholarResponseSchema = z.object({ data: z.array(rawPaperSchema) })
const crossrefResponseSchema = z.object({
  message: z.object({
    items: z.array(
      z.object({
        DOI: z.string().min(1).optional(),
        title: z.array(z.string().min(1)).default([]),
        author: z
          .array(z.object({ given: z.string().optional(), family: z.string().optional() }))
          .default([]),
        published: z.object({ "date-parts": z.array(z.array(z.number().int())) }).optional(),
        "container-title": z.array(z.string()).default([]),
        abstract: z.string().optional(),
        URL: z.string().url().optional(),
        "is-referenced-by-count": z.number().int().nonnegative().optional(),
      }),
    ),
  }),
})

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

function isHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).protocol === "https:" ? value : null
  } catch {
    return null
  }
}

function parseJson(body: string): unknown | null {
  try {
    return JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

function parsePapers(value: unknown): readonly CitationPaper[] {
  const parsed = semanticScholarResponseSchema.safeParse(value)
  if (!parsed.success) return []
  return parsed.data.data.flatMap((item) => {
    const paper = citationPaperSchema.safeParse({
      paperId: item.paperId,
      title: item.title,
      authors: item.authors.flatMap((author) => (author.name ? [author.name] : [])),
      year: item.year ?? null,
      venue: item.venue ?? "",
      abstract: item.abstract ?? null,
      doi: item.externalIds?.DOI ?? null,
      url: isHttpsUrl(item.url),
      openAccessUrl: isHttpsUrl(item.openAccessPdf?.url),
      citationCount: item.citationCount ?? null,
    })
    return paper.success ? [paper.data] : []
  })
}

function parseCrossrefPapers(value: unknown): readonly CitationPaper[] {
  const parsed = crossrefResponseSchema.safeParse(value)
  if (!parsed.success) return []
  return parsed.data.message.items.flatMap((item) => {
    const title = item.title[0]
    if (!title) return []
    const year = item.published?.["date-parts"][0]?.[0] ?? null
    const doi = item.DOI ?? null
    const url = isHttpsUrl(item.URL) ?? (doi ? `https://doi.org/${doi}` : null)
    const paper = citationPaperSchema.safeParse({
      paperId: doi ?? url ?? title,
      title,
      authors: item.author.map(({ given, family }) => [given, family].filter(Boolean).join(" ")),
      year,
      venue: item["container-title"][0] ?? "",
      abstract: item.abstract ?? null,
      doi,
      url,
      openAccessUrl: null,
      citationCount: item["is-referenced-by-count"] ?? null,
    })
    return paper.success ? [paper.data] : []
  })
}

async function defaultTransport(url: string): Promise<TransportResponse> {
  const response = await request(url, {
    method: "GET",
    headers: { accept: "application/json", "user-agent": "Hotebook/0.1" },
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
    return citationLookupResultSchema.parse({ status: "not_found", paper: null, query })
  } catch (error) {
    if (error instanceof Error) {
      return citationLookupResultSchema.parse({ status: "not_found", paper: null, query })
    }
    throw error
  }
}
