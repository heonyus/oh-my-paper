import type { CitationLookupRequest, CitationPaper } from "../shared/ipc"

const titleStopWords = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "via",
  "with",
])

function words(value: string): readonly string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length > 1 && !titleStopWords.has(word))
}

export function normalizedDoi(value: string | null | undefined): string | null {
  if (!value) return null
  return value
    .toLocaleLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//u, "")
    .trim()
}

function titleSimilarity(expectedTitle: string, actualTitle: string): number {
  const expected = new Set(words(expectedTitle))
  const actual = new Set(words(actualTitle))
  if (expected.size === 0 || actual.size === 0) return 0
  const overlap = [...expected].filter((word) => actual.has(word)).length
  return (2 * overlap) / (expected.size + actual.size)
}

function authorMatches(expectedAuthors: string, actualAuthors: readonly string[]): boolean {
  const expected = new Set(words(expectedAuthors))
  if (expected.size === 0) return false
  const actual = new Set(actualAuthors.flatMap((author) => words(author)))
  return [...expected].some((word) => actual.has(word))
}

export type CitationIdentityMatch = {
  readonly paper: CitationPaper
  readonly score: number
  readonly signals: readonly string[]
  readonly candidatesCompared: number
}

function scoreCandidate(
  paper: CitationPaper,
  request: CitationLookupRequest,
  candidatesCompared: number,
): CitationIdentityMatch | null {
  const requestedDoi = normalizedDoi(request.doi)
  const paperDoi = normalizedDoi(paper.doi)
  if (requestedDoi && paperDoi !== requestedDoi) return null
  if (requestedDoi && paperDoi === requestedDoi) {
    return { paper, score: 1, signals: ["DOI exact match"], candidatesCompared }
  }
  if (!request.title) return null
  const similarity = titleSimilarity(request.title, paper.title)
  if (similarity < 0.72) return null
  const titleWeight = request.authors || request.year ? 0.75 : 0.9
  let score = similarity * titleWeight
  const signals = [`title similarity ${Math.round(similarity * 100)}%`]
  if (request.authors && authorMatches(request.authors, paper.authors)) {
    score += 0.15
    signals.push("author match")
  }
  if (request.year && paper.year === request.year) {
    score += 0.1
    signals.push("year match")
  }
  if (score < 0.78) return null
  return { paper, score: Math.min(1, score), signals, candidatesCompared }
}

export function selectCitationPaper(
  candidates: readonly CitationPaper[],
  request: CitationLookupRequest,
): CitationIdentityMatch | null {
  return (
    candidates
      .flatMap((paper) => {
        const match = scoreCandidate(paper, request, candidates.length)
        return match ? [match] : []
      })
      .sort((left, right) => right.score - left.score)[0] ?? null
  )
}

function requestedSurname(request: CitationLookupRequest): string | null {
  const source = request.authors || request.key.replace(/-\d{4}[a-z]?$/iu, "")
  return words(source).find((word) => word !== "al" && word !== "et") ?? null
}

export function selectCitationGraphPaper(
  candidates: readonly CitationPaper[],
  request: CitationLookupRequest,
): CitationIdentityMatch | null {
  const direct = selectCitationPaper(candidates, request)
  if (direct) {
    return {
      ...direct,
      signals: [...direct.signals, "current-paper reference graph"],
    }
  }
  const surname = requestedSurname(request)
  if (!surname || !request.year) return null
  const matching = candidates.filter(
    (paper) =>
      paper.year === request.year &&
      paper.authors.some((author) => words(author).includes(surname)),
  )
  const paper = matching.length === 1 ? matching[0] : undefined
  return paper
    ? {
        paper,
        score: 0.86,
        signals: ["author match", "year match", "current-paper reference graph"],
        candidatesCompared: candidates.length,
      }
    : null
}
