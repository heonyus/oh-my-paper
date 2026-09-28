import type { ScholarlySearchItem } from "../../shared/scholarlySearchSchemas"
import type { DocumentRecord } from "../types"
import type { ScholarlySearchRecommendation } from "./scholarlySearchRelevance"

const resultLimit = 20
const queryStopWords = new Set(["and", "for", "the", "with", "논문", "연구", "관련", "찾아줘"])

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/** Latin words need three letters to mean something; two Hangul syllables already do. */
export function queryTerms(query: string): readonly string[] {
  return [
    ...new Set(
      normalized(query)
        .split(/\s+/u)
        .filter(
          (word) => (word.length >= 3 || /^[가-힣]{2,}$/u.test(word)) && !queryStopWords.has(word),
        ),
    ),
  ]
}

/** Substring match so Korean terms still match when a particle is attached (기억 → 기억하게). */
function matches(text: string, terms: readonly string[]): readonly string[] {
  const haystack = normalized(text)
  return terms.filter((term) => haystack.includes(term))
}

/**
 * Orders results for a query the user typed. Unlike the document recommendations, nothing is
 * dropped for lacking overlap with the open paper: semantic results often share no words with
 * the query yet answer it.
 */
export function rankForUserQuery(
  query: string,
  items: readonly ScholarlySearchItem[],
  document: Pick<DocumentRecord, "title" | "doi">,
): readonly ScholarlySearchRecommendation[] {
  const terms = queryTerms(query)
  const ownTitle = normalized(document.title)
  const ownDoi = document.doi?.trim().toLowerCase() ?? null
  const seen = new Set<string>()
  const ranked: (ScholarlySearchRecommendation & { readonly order: number })[] = []
  items.forEach((item, order) => {
    const title = normalized(item.title)
    const doi = item.identity.doi?.toLowerCase() ?? null
    if (title === ownTitle || (doi !== null && doi === ownDoi)) return
    const keys = [title, doi].filter((key): key is string => key !== null)
    if (keys.some((key) => seen.has(key))) return
    for (const key of keys) seen.add(key)
    const titleMatches = matches(item.title, terms)
    const abstractMatches = item.abstract ? matches(item.abstract, terms) : []
    const matched = [...new Set([...titleMatches, ...abstractMatches])].slice(0, 4)
    ranked.push({
      item,
      order,
      score: titleMatches.length * 3 + abstractMatches.length,
      reasons: [
        matched.length > 0
          ? `검색어 일치: ${matched.join(", ")}`
          : item.provider === "openalex"
            ? "의미 기반 검색 결과"
            : "검색 결과",
      ],
    })
  })
  return ranked
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, resultLimit)
    .map(({ item, score, reasons }) => ({ item, score, reasons }))
}
