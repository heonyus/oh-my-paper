import { fetchArxivAbstract, searchArxiv } from "./arxivClient"
import { searchDataCite } from "./dataCiteClient"
import {
  openAlexCitingWorks,
  openAlexWorksByIds,
  searchOpenAlexKeyword,
  searchOpenAlexSemantic,
} from "./openAlexClient"
import type { PaperDiscoverySources } from "./paperDiscovery"
import { scholarlyApiKeys } from "./scholarlyApiKeys"
import {
  searchSemanticScholar,
  semanticScholarCitations,
  semanticScholarRecommendations,
  semanticScholarRef,
  semanticScholarReferences,
} from "./semanticScholarClient"
import { createWebPaperSearch, type WebPaperResolver } from "./webPaperSource"
import { createSearxngEngine, searxngBaseUrl, type WebSearchEngine } from "./webSearchEngines"

export type PaperDiscoveryOptions = {
  /** A web search engine for the once-per-turn fallback, such as the Claude subscription's. */
  readonly fallbackEngine?: WebSearchEngine | null | undefined
}

/**
 * Free scholarly sources only. Optional free API keys raise rate limits:
 * `OH_MY_PAPER_S2_API_KEY` (Semantic Scholar) and `OH_MY_PAPER_OPENALEX_API_KEY` (OpenAlex).
 * `OH_MY_PAPER_SEARXNG_URL` adds a SearXNG instance (open-source metasearch) whose hits are
 * resolved to paper records through OpenAlex and arXiv.
 */
export function createPaperDiscoverySources(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: PaperDiscoveryOptions = {},
): PaperDiscoverySources {
  const keys = scholarlyApiKeys(env)
  const s2 = { apiKey: keys.s2 }
  const openAlex = { apiKey: keys.openAlex }
  const { OH_MY_PAPER_SEARXNG_URL: searxngUrl } = env
  const searxng = searxngBaseUrl(searxngUrl)
  const resolver: WebPaperResolver = {
    byIds: (ids, signal) => openAlexWorksByIds(ids, { ...openAlex, signal }),
    arxivAbstract: (arxivId, signal) => fetchArxivAbstract(arxivId, { signal }),
    byTitle: (title, signal) =>
      searchOpenAlexKeyword(
        { query: title, limit: 3, yearFrom: null, yearTo: null },
        { ...openAlex, signal },
      ),
  }
  const web = searxng ? createSearxngEngine(searxng) : null
  const fallback = options.fallbackEngine ?? null
  return {
    fallback: fallback
      ? {
          label: fallback.label,
          search: createWebPaperSearch(fallback, resolver, {
            hits: 10,
            abstractFetches: 3,
            titleLookups: 3,
          }),
        }
      : null,
    semantic: {
      label: "OpenAlex",
      search: (input, signal) => searchOpenAlexSemantic(input, { ...openAlex, signal }),
    },
    keyword: [
      { label: "arXiv", search: (input, signal) => searchArxiv(input, { signal }) },
      {
        label: "Semantic Scholar",
        search: (input, signal) => searchSemanticScholar(input, { ...s2, signal }),
      },
      {
        label: "OpenAlex 키워드",
        search: (input, signal) => searchOpenAlexKeyword(input, { ...openAlex, signal }),
      },
      { label: "DataCite(arXiv)", search: (input, signal) => searchDataCite(input, { signal }) },
      ...(web ? [{ label: web.label, search: createWebPaperSearch(web, resolver) }] : []),
    ],
    recommendations: async (seeds, limit, signal) => {
      const positiveRefs = seeds
        .map(semanticScholarRef)
        .filter((ref): ref is string => ref !== null)
      return positiveRefs.length > 0
        ? semanticScholarRecommendations({ positiveRefs, limit }, { ...s2, signal })
        : []
    },
    references: async (seed, limit, signal) => {
      const paperRef = semanticScholarRef(seed)
      return paperRef ? semanticScholarReferences({ paperRef, limit }, { ...s2, signal }) : []
    },
    citing: async (seed, limit, signal) => {
      const paperRef = semanticScholarRef(seed)
      if (paperRef) return semanticScholarCitations({ paperRef, limit }, { ...s2, signal })
      const openAlexId = seed.ids.openAlexId
      return openAlexId ? openAlexCitingWorks({ openAlexId, limit }, { ...openAlex, signal }) : []
    },
  }
}
