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
import { normalizedDoi, selectCitationPaper } from "./citationMatching"

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
const arxivEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  published: z.string().min(1),
  author: z.array(z.object({ name: z.string().min(1) })).default([]),
  summary: z.string().optional(),
})
const arxivResponseSchema = z.object({
  entry: z.union([arxivEntrySchema, z.array(arxivEntrySchema)]).optional(),
})
const openAlexWorkSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publication_year: z.number().int().nullable().optional(),
  doi: z.string().nullable().optional(),
  authorships: z
    .array(z.object({ author: z.object({ display_name: z.string().nullable().optional() }) }))
    .default([]),
  cited_by_count: z.number().int().nonnegative().nullable().optional(),
  primary_location: z
    .object({
      source: z.object({ display_name: z.string().nullable().optional() }).nullable().optional(),
    })
    .nullable()
    .optional(),
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

export function parseArxivPapers(value: unknown): readonly CitationPaper[] {
  const parsed = arxivResponseSchema.safeParse(value)
  if (!parsed.success) return []
  const entries = Array.isArray(parsed.data.entry) ? parsed.data.entry : [parsed.data.entry]
  return entries.flatMap((item) => {
    if (!item) return []
    const year = Number(item.published.slice(0, 4))
    const paper = citationPaperSchema.safeParse({
      paperId: item.id,
      title: item.title.replace(/\s+/gu, " ").trim(),
      authors: item.author.map((author) => author.name),
      year: Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : null,
      venue: "arXiv",
      abstract: item.summary ?? null,
      doi: null,
      url: isHttpsUrl(item.id),
      openAccessUrl: isHttpsUrl(item.id),
      citationCount: null,
    })
    return paper.success ? [paper.data] : []
  })
}

export function parseArxivXml(body: string): unknown {
  const entryPattern = new RegExp("<entry>([\\s\\S]*?)</entry>", "gu")
  const entryMatches = [...body.matchAll(entryPattern)]
  const entries = entryMatches.map((entry) => {
    const pick = (tag: string): string =>
      entry[1]
        ?.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "u"))?.[1]
        ?.trim() ?? ""
    const namePattern = new RegExp("<name>([\\s\\S]*?)</name>", "gu")
    const authors = [...(entry[1]?.matchAll(namePattern) ?? [])]
      .map((match) => match[1]?.trim() ?? "")
      .filter((name) => name.length > 0)
    return {
      id: pick("id"),
      title: pick("title"),
      published: pick("published"),
      author: authors.map((name) => ({ name })),
      summary: pick("summary") || undefined,
    }
  })
  return { entry: entries }
}

function parseOpenAlexPapers(value: unknown): readonly CitationPaper[] {
  const parsed = z.object({ results: z.array(openAlexWorkSchema) }).safeParse(value)
  if (!parsed.success) return []
  return parsed.data.results.flatMap((item) => {
    const doi = normalizedDoi(item.doi)
    const paper = citationPaperSchema.safeParse({
      paperId: item.id,
      title: item.title.replace(/\s+/gu, " ").trim(),
      authors: item.authorships.flatMap((authorship) =>
        authorship.author.display_name ? [authorship.author.display_name] : [],
      ),
      year: item.publication_year ?? null,
      venue: item.primary_location?.source?.display_name ?? "OpenAlex",
      abstract: null,
      doi: doi,
      url: item.doi && isHttpsUrl(item.doi) ? item.doi : null,
      openAccessUrl: null,
      citationCount: item.cited_by_count ?? null,
    })
    return paper.success ? [paper.data] : []
  })
}

async function defaultTransport(url: string): Promise<TransportResponse> {
  const response = await request(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": url.includes("openalex.org")
        ? "Hotebook/0.1 (https://github.com/heonyus/hotebook)"
        : "Hotebook/0.1",
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
    return citationLookupResultSchema.parse({ status: "not_found", paper: null, query })
  } catch (error) {
    if (error instanceof Error) {
      return citationLookupResultSchema.parse({ status: "not_found", paper: null, query })
    }
    throw error
  }
}
