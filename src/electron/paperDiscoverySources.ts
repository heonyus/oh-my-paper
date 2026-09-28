import { searchArxiv } from "./arxivClient"
import { openAlexCitingWorks, searchOpenAlexSemantic } from "./openAlexClient"
import type { PaperDiscoverySources } from "./paperDiscovery"
import { scholarlyApiKeys } from "./scholarlyApiKeys"
import {
  searchSemanticScholar,
  semanticScholarCitations,
  semanticScholarRecommendations,
  semanticScholarRef,
  semanticScholarReferences,
} from "./semanticScholarClient"

/**
 * Free scholarly sources only. Optional free API keys raise rate limits:
 * `OH_MY_PAPER_S2_API_KEY` (Semantic Scholar) and `OH_MY_PAPER_OPENALEX_API_KEY` (OpenAlex).
 */
export function createPaperDiscoverySources(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PaperDiscoverySources {
  const keys = scholarlyApiKeys(env)
  const s2 = { apiKey: keys.s2 }
  const openAlex = { apiKey: keys.openAlex }
  return {
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
