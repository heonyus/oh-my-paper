import type {
  ParsedScholarlySearchRequest,
  ScholarlyProvider,
} from "../shared/scholarlySearchSchemas"
import { arxivSearchQuery } from "./arxivClient"
import { OPENALEX_SEMANTIC_LIMIT } from "./openAlexClient"

export function buildScholarlyProviderUrl(
  provider: ScholarlyProvider,
  request: ParsedScholarlySearchRequest,
  options: { readonly openAlexApiKey?: string | undefined } = {},
): URL {
  const offset = (request.page - 1) * request.pageSize
  switch (provider) {
    case "crossref": {
      const url = new URL("https://api.crossref.org/works")
      url.searchParams.set("query.bibliographic", request.query)
      url.searchParams.set("rows", String(request.pageSize))
      url.searchParams.set("offset", String(offset))
      url.searchParams.set(
        "select",
        "DOI,title,author,published,container-title,abstract,URL,is-referenced-by-count",
      )
      const filters = [
        request.filters.fromYear ? `from-pub-date:${request.filters.fromYear}-01-01` : null,
        request.filters.toYear ? `until-pub-date:${request.filters.toYear}-12-31` : null,
      ].filter((value): value is string => value !== null)
      if (filters.length > 0) url.searchParams.set("filter", filters.join(","))
      return url
    }
    case "arxiv": {
      const url = new URL("https://export.arxiv.org/api/query")
      const query = request.query.replace(/\s+/gu, " ").trim()
      url.searchParams.set(
        "search_query",
        arxivSearchQuery(query, request.filters.fromYear, request.filters.toYear) ??
          `all:"${query.replace(/"/gu, " ")}"`,
      )
      url.searchParams.set("start", String(offset))
      url.searchParams.set("max_results", String(request.pageSize))
      url.searchParams.set("sortBy", "relevance")
      return url
    }
    case "openalex": {
      const url = new URL("https://api.openalex.org/works")
      // Semantic search understands titles and plain descriptions and stays open to keyless
      // callers; it returns a single page, so later pages fall back to keyword search.
      if (request.page === 1) {
        url.searchParams.set("search.semantic", request.query.slice(0, 1_900))
        url.searchParams.set(
          "per_page",
          String(Math.min(request.pageSize, OPENALEX_SEMANTIC_LIMIT)),
        )
      } else {
        url.searchParams.set("search", request.query)
        url.searchParams.set("page", String(request.page))
        url.searchParams.set("per_page", String(request.pageSize))
      }
      url.searchParams.set(
        "select",
        "id,title,publication_year,doi,authorships,cited_by_count,primary_location,abstract_inverted_index",
      )
      if (options.openAlexApiKey) url.searchParams.set("api_key", options.openAlexApiKey)
      const filters = [
        request.filters.fromYear ? `from_publication_date:${request.filters.fromYear}-01-01` : null,
        request.filters.toYear ? `to_publication_date:${request.filters.toYear}-12-31` : null,
      ].filter((value): value is string => value !== null)
      if (filters.length > 0) url.searchParams.set("filter", filters.join(","))
      return url
    }
    default:
      throw new TypeError(`Unexpected scholarly provider: ${provider}`)
  }
}
