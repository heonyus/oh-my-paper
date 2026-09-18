import { z } from "zod"
import type { CitationPaper } from "../shared/ipc"
import {
  type ParsedScholarlySearchRequest,
  type ScholarlyProvider,
  type ScholarlyProviderState,
  type ScholarlySearchItem,
  scholarlySearchItemSchema,
} from "../shared/scholarlySearchSchemas"
import { normalizedDoi } from "./citationMatching"
import {
  parseArxivPapers,
  parseArxivXml,
  parseCrossrefPapers,
  parseJson,
  parseOpenAlexPapers,
} from "./citationProviderParsers"
import { type ScholarlyTransport, ScholarlyTransportError } from "./scholarlySearchTransport"
import { buildScholarlyProviderUrl } from "./scholarlySearchUrls"

const crossrefEnvelopeSchema = z.object({
  message: z.object({
    "total-results": z.number().int().nonnegative(),
    items: z.array(z.unknown()),
  }),
})
const openAlexEnvelopeSchema = z.object({
  meta: z.object({ count: z.number().int().nonnegative() }),
  results: z.array(z.unknown()),
})

export type ProviderSearchOutcome = {
  readonly state: ScholarlyProviderState
  readonly results: readonly ScholarlySearchItem[]
}

function providerRecordId(provider: ScholarlyProvider, paper: CitationPaper): string {
  switch (provider) {
    case "crossref":
      return normalizedDoi(paper.doi) ?? paper.paperId
    case "arxiv":
    case "openalex":
      try {
        const url = new URL(paper.paperId)
        return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? paper.paperId)
      } catch (error) {
        if (error instanceof TypeError) return paper.paperId
        throw error
      }
    default:
      throw new TypeError(`Unexpected scholarly provider: ${provider}`)
  }
}

function providerIdentity(provider: ScholarlyProvider, paper: CitationPaper) {
  const recordId = providerRecordId(provider, paper)
  switch (provider) {
    case "crossref":
      return {
        providerRecordId: recordId,
        doi: normalizedDoi(paper.doi),
        arxivId: null,
        openAlexId: null,
      }
    case "arxiv":
      return {
        providerRecordId: recordId,
        doi: normalizedDoi(paper.doi),
        arxivId: recordId,
        openAlexId: null,
      }
    case "openalex":
      return {
        providerRecordId: recordId,
        doi: normalizedDoi(paper.doi),
        arxivId: null,
        openAlexId: recordId,
      }
    default:
      throw new TypeError(`Unexpected scholarly provider: ${provider}`)
  }
}

function toSearchItem(provider: ScholarlyProvider, paper: CitationPaper): ScholarlySearchItem {
  return scholarlySearchItemSchema.parse({
    provider,
    identity: providerIdentity(provider, paper),
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    abstract: paper.abstract,
    landingUrl: paper.url,
    citationCount: paper.citationCount,
    access: {
      metadata: "available",
      abstract: paper.abstract ? "available" : "unavailable",
      fullText: paper.openAccessUrl
        ? { state: "open", url: paper.openAccessUrl }
        : { state: "unavailable", url: null },
    },
  })
}

function parseProviderBody(
  provider: ScholarlyProvider,
  body: string,
): { readonly papers: readonly CitationPaper[]; readonly total: number | null } | null {
  switch (provider) {
    case "crossref": {
      const value = parseJson(body)
      const envelope = crossrefEnvelopeSchema.safeParse(value)
      if (!envelope.success) return null
      const papers = parseCrossrefPapers(value)
      return envelope.data.message.items.length > 0 && papers.length === 0
        ? null
        : { papers, total: envelope.data.message["total-results"] }
    }
    case "arxiv": {
      if (!body.includes("<feed") || !body.includes("</feed>")) return null
      const totalMatch = body.match(
        /<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/u,
      )
      return {
        papers: parseArxivPapers(parseArxivXml(body)),
        total: totalMatch?.[1] ? Number(totalMatch[1]) : null,
      }
    }
    case "openalex": {
      const value = parseJson(body)
      const envelope = openAlexEnvelopeSchema.safeParse(value)
      if (!envelope.success) return null
      const papers = parseOpenAlexPapers(value)
      return envelope.data.results.length > 0 && papers.length === 0
        ? null
        : { papers, total: envelope.data.meta.count }
    }
    default:
      throw new TypeError(`Unexpected scholarly provider: ${provider}`)
  }
}

function errorOutcome(
  error: ScholarlyProviderState & { readonly status: "error" },
): ProviderSearchOutcome {
  return { state: error, results: [] }
}

export async function searchProvider(input: {
  readonly provider: ScholarlyProvider
  readonly request: ParsedScholarlySearchRequest
  readonly transport: ScholarlyTransport
  readonly signal: AbortSignal | undefined
}): Promise<ProviderSearchOutcome> {
  try {
    const response = await input.transport(
      buildScholarlyProviderUrl(input.provider, input.request),
      input.signal,
    )
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return errorOutcome({
        provider: input.provider,
        status: "error",
        error: {
          kind: response.statusCode === 429 ? "rate_limited" : "http_error",
          httpStatus: response.statusCode,
          retryAfterSeconds: response.retryAfterSeconds,
        },
      })
    }
    const parsed = parseProviderBody(input.provider, response.body)
    if (parsed === null) {
      return errorOutcome({
        provider: input.provider,
        status: "error",
        error: {
          kind: "malformed_response",
          httpStatus: response.statusCode,
          retryAfterSeconds: null,
        },
      })
    }
    const results = parsed.papers.map((paper) => toSearchItem(input.provider, paper))
    return {
      state: {
        provider: input.provider,
        status: "success",
        freshness: "live",
        resultCount: results.length,
        totalResults: parsed.total,
        hasMore:
          parsed.total === null
            ? results.length === input.request.pageSize
            : input.request.page * input.request.pageSize < parsed.total,
      },
      results,
    }
  } catch (error) {
    if (error instanceof ScholarlyTransportError) {
      return errorOutcome({
        provider: input.provider,
        status: "error",
        error: { kind: error.kind, httpStatus: null, retryAfterSeconds: null },
      })
    }
    if (error instanceof z.ZodError) {
      return errorOutcome({
        provider: input.provider,
        status: "error",
        error: { kind: "malformed_response", httpStatus: 200, retryAfterSeconds: null },
      })
    }
    throw error
  }
}
