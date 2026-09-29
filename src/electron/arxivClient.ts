import { parseArxivPapers, parseArxivXml } from "./citationProviderParsers"
import { displayName, normalizedArxivId, type PaperCandidate } from "./paperCandidates"
import { PaperSourceError, requestSource, sourcePacers } from "./paperSourceHttp"
import type { ScholarlyTransport } from "./scholarlySearchTransport"

const ARXIV_QUERY_URL = "https://export.arxiv.org/api/query"
const ARXIV_ABSTRACT_URL = "https://arxiv.org/abs/"
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

export type QueryTerms = {
  readonly phrases: readonly string[]
  readonly words: readonly string[]
}

/** Quoted phrases and the remaining meaningful words of a keyword query, words lower-cased. */
export function queryTerms(query: string): QueryTerms {
  const phrases = [...query.matchAll(/"([^"]+)"/gu)]
    .map((match) => match[1]?.replace(/\s+/gu, " ").trim() ?? "")
    .filter((phrase) => phrase.length > 1)
  const words = query
    .replace(/"[^"]*"/gu, " ")
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}-]+/u)
    .map((word) => word.replace(/^-+|-+$/gu, "").toLowerCase())
    .filter((word) => word.length > 1 && !stopWords.has(word))
  return { phrases, words }
}

/**
 * Builds an arXiv `search_query` that requires every meaningful term (quoted phrases stay
 * phrases). Sending a whole sentence as one quoted phrase almost never matches anything.
 */
export function arxivSearchQuery(
  query: string,
  yearFrom: number | null = null,
  yearTo: number | null = null,
): string | null {
  const { phrases, words } = queryTerms(query)
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

const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
}

/** Decodes the named and numeric character references found in HTML attribute values. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity: string, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X"
      const codePoint = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity
    }
    return namedEntities[body.toLowerCase()] ?? entity
  })
}

function metaContents(html: string, name: string): string[] {
  const pattern = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, "giu")
  return [...html.matchAll(pattern)]
    .map((match) =>
      decodeHtmlEntities(match[1] ?? "")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter((value) => value.length > 0)
}

/** A paper read from the `citation_*` meta tags of an arXiv abstract page. */
export function parseArxivAbstractPage(
  html: string,
  fallbackArxivId: string | null = null,
): PaperCandidate | null {
  const title = metaContents(html, "citation_title")[0]
  const arxivId = normalizedArxivId(metaContents(html, "citation_arxiv_id")[0] ?? fallbackArxivId)
  if (!title || !arxivId) return null
  const date =
    metaContents(html, "citation_date")[0] ?? metaContents(html, "citation_online_date")[0]
  const year = date ? Number.parseInt(date.slice(0, 4), 10) : Number.NaN
  return {
    source: "arxiv",
    title,
    authors: metaContents(html, "citation_author").map(displayName),
    year: Number.isInteger(year) && year >= 1000 ? year : null,
    venue: "arXiv",
    abstract: metaContents(html, "citation_abstract")[0] ?? null,
    landingUrl: `https://arxiv.org/abs/${arxivId}`,
    fullTextUrl: `https://arxiv.org/pdf/${arxivId}`,
    citationCount: null,
    ids: { doi: null, arxivId, s2Id: null, openAlexId: null },
  }
}

/**
 * One paper from its arxiv.org abstract page. The page is served independently of the query
 * API, so it still answers while that API is rate-limiting.
 */
export async function fetchArxivAbstract(
  arxivId: string,
  options: {
    readonly signal?: AbortSignal | undefined
    readonly transport?: ScholarlyTransport | undefined
  } = {},
): Promise<PaperCandidate | null> {
  const id = normalizedArxivId(arxivId)
  if (!id) return null
  const body = await requestSource({
    url: new URL(`${ARXIV_ABSTRACT_URL}${id}`),
    pacer: sourcePacers.arxivSite,
    signal: options.signal,
    transport: options.transport,
    init: { headers: { accept: "text/html" } },
  })
  return parseArxivAbstractPage(body, id)
}
