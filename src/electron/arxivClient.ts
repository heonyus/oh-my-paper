import { parseArxivPapers, parseArxivXml } from "./citationProviderParsers"
import { normalizedArxivId, type PaperCandidate } from "./paperCandidates"
import { PaperSourceError, requestSource, sourcePacers } from "./paperSourceHttp"
import type { ScholarlyTransport } from "./scholarlySearchTransport"

const ARXIV_QUERY_URL = "https://export.arxiv.org/api/query"
const maxTerms = 6

const stopWords = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "based",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "towards",
  "using",
  "via",
  "what",
  "with",
  "without",
])

/**
 * Builds an arXiv `search_query` that requires every meaningful term (quoted phrases stay
 * phrases). Sending a whole sentence as one quoted phrase almost never matches anything.
 */
export function arxivSearchQuery(
  query: string,
  yearFrom: number | null = null,
  yearTo: number | null = null,
): string | null {
  const phrases = [...query.matchAll(/"([^"]+)"/gu)]
    .map((match) => match[1]?.replace(/\s+/gu, " ").trim() ?? "")
    .filter((phrase) => phrase.length > 1)
  const words = query
    .replace(/"[^"]*"/gu, " ")
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}-]+/u)
    .map((word) => word.replace(/^-+|-+$/gu, "").toLowerCase())
    .filter((word) => word.length > 1 && !stopWords.has(word))
  const terms = [...new Set([...phrases.map((phrase) => `"${phrase}"`), ...words])].slice(
    0,
    maxTerms,
  )
  if (terms.length === 0) return null
  const clauses = terms.map((term) => `all:${term}`)
  if (yearFrom !== null || yearTo !== null) {
    clauses.push(`submittedDate:[${yearFrom ?? 1991}01010000 TO ${yearTo ?? 9999}12312359]`)
  }
  return clauses.join(" AND ")
}

function candidateFrom(paper: ReturnType<typeof parseArxivPapers>[number]): PaperCandidate | null {
  const arxivId = normalizedArxivId(paper.paperId)
  if (!arxivId) return null
  return {
    source: "arxiv",
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    venue: "arXiv",
    abstract: paper.abstract?.replace(/\s+/gu, " ").trim() ?? null,
    landingUrl: `https://arxiv.org/abs/${arxivId}`,
    fullTextUrl: `https://arxiv.org/pdf/${arxivId}`,
    citationCount: null,
    ids: { doi: null, arxivId, s2Id: null, openAlexId: null },
  }
}

export async function searchArxiv(
  input: {
    readonly query: string
    readonly limit: number
    readonly yearFrom: number | null
    readonly yearTo: number | null
  },
  options: {
    readonly signal?: AbortSignal | undefined
    readonly transport?: ScholarlyTransport | undefined
  } = {},
): Promise<PaperCandidate[]> {
  const searchQuery = arxivSearchQuery(input.query, input.yearFrom, input.yearTo)
  if (searchQuery === null) return []
  const url = new URL(ARXIV_QUERY_URL)
  url.searchParams.set("search_query", searchQuery)
  url.searchParams.set("start", "0")
  url.searchParams.set("max_results", String(Math.min(Math.max(input.limit, 1), 50)))
  url.searchParams.set("sortBy", "relevance")
  const body = await requestSource({
    url,
    pacer: sourcePacers.arxiv,
    signal: options.signal,
    transport: options.transport,
  })
  if (!body.includes("<feed") || !body.includes("</feed>")) {
    throw new PaperSourceError("malformed")
  }
  return parseArxivPapers(parseArxivXml(body))
    .map(candidateFrom)
    .filter((paper): paper is PaperCandidate => paper !== null)
}
