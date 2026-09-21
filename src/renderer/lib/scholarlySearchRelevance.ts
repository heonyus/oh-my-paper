import type { ScholarlySearchItem } from "../../shared/scholarlySearchSchemas"
import type { DocumentRecord } from "../types"
import type { CitationIndexEntry } from "./pdfCitationIndex"

export type ScholarlySearchRecommendation = {
  readonly item: ScholarlySearchItem
  readonly score: number
  readonly reasons: readonly string[]
}

export type ScholarlySearchBasis = "title" | "doi" | "topic" | null

type SearchContext = {
  readonly title: string | null
  readonly doi: string | null
  readonly terms: readonly string[]
  readonly requiredTerms: readonly string[]
  readonly referenceTitles: readonly string[]
}

const genericTopicWords = new Set([
  "attention",
  "deep",
  "learning",
  "mechanism",
  "mechanisms",
  "network",
  "networks",
  "neural",
  "recurrent",
  "research",
  "self",
  "sequence",
  "training",
])

const stopWords = new Set([
  "about",
  "after",
  "all",
  "and",
  "arxiv",
  "based",
  "between",
  "bridging",
  "for",
  "from",
  "gap",
  "human",
  "into",
  "logic",
  "machine",
  "method",
  "methods",
  "model",
  "models",
  "new",
  "need",
  "overview",
  "our",
  "paper",
  "study",
  "system",
  "systems",
  "that",
  "the",
  "their",
  "this",
  "technical",
  "toward",
  "towards",
  "using",
  "uses",
  "via",
  "with",
  "you",
  "google",
  "preprint",
  "com",
  "cs",
  "cl",
])

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function words(value: string): readonly string[] {
  return [
    ...new Set(
      normalized(value)
        .split(/\s+/u)
        .filter((word) => word.length >= 3 && !stopWords.has(word)),
    ),
  ]
}

function topicWords(value: string): readonly string[] {
  const tokens = normalized(value)
    .split(/\s+/u)
    .filter((word) => word.length >= 3 && !stopWords.has(word))
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  const ordered = [...new Set(tokens)].sort(
    (left, right) =>
      (counts.get(right) ?? 0) - (counts.get(left) ?? 0) ||
      tokens.indexOf(left) - tokens.indexOf(right),
  )
  const repeated = ordered.filter((token) => (counts.get(token) ?? 0) > 1)
  return repeated.length >= 2 ? repeated : ordered
}

function likelyTemporaryTitle(document: DocumentRecord): boolean {
  const title = normalized(document.title)
  const fileStem = normalized(document.name.replace(/\.pdf$/iu, ""))
  return (
    title.length === 0 ||
    title === fileStem ||
    /^\d{10,}[-_]/u.test(title) ||
    title.length > 180 ||
    /\b(?:references?|bibliography|figure|table|input[-\s]input|eos|pad)\b/iu.test(title)
  )
}

function contextFor(
  document: DocumentRecord,
  citations: readonly CitationIndexEntry[],
): SearchContext {
  const title = likelyTemporaryTitle(document) ? null : document.title.trim()
  const referenceTitles = citations
    .map((citation) => citation.title.trim())
    .filter((value) => value.length >= 8)
    .slice(0, 4)
  const overviewTerms = topicWords(document.overview).slice(0, 12)
  const requiredTerms = [...new Set([...words(title ?? ""), ...overviewTerms])].filter(
    (term) => !genericTopicWords.has(term) && !/^\d+$/u.test(term),
  )
  const terms = [
    ...new Set(words(title ?? "").concat(overviewTerms, ...referenceTitles.map(words))),
  ]
  return {
    title,
    doi: document.doi?.trim().toLowerCase() ?? null,
    terms,
    requiredTerms,
    referenceTitles,
  }
}

export function scholarlyQueryForDocument(
  document: DocumentRecord,
  citations: readonly CitationIndexEntry[] = [],
): string | null {
  const context = contextFor(document, citations)
  if (context.title) return context.title.slice(0, 500)
  if (context.doi) return context.doi
  const topicTerms = topicWords(document.overview)
  if (topicTerms.length >= 2) return topicTerms.slice(0, 8).join(" ")
  const referenceQuery = context.referenceTitles.map((title) =>
    words(title).slice(0, 4).join(" "),
  )[0]
  return referenceQuery && referenceQuery.length > 0 ? referenceQuery.slice(0, 500) : null
}

export function scholarlySearchBasis(
  document: DocumentRecord,
  citations: readonly CitationIndexEntry[] = [],
): ScholarlySearchBasis {
  const context = contextFor(document, citations)
  if (context.title) return "title"
  if (context.doi) return "doi"
  return context.terms.length > 0 ? "topic" : null
}

function titleKey(item: ScholarlySearchItem): string {
  return normalized(item.title)
}

function doiKey(item: ScholarlySearchItem): string | null {
  return item.identity.doi?.trim().toLowerCase() ?? null
}

function matchingTerms(value: string, terms: readonly string[]): readonly string[] {
  const candidate = new Set(words(value))
  return terms.filter((term) => candidate.has(term)).slice(0, 4)
}

function recommendationFor(
  item: ScholarlySearchItem,
  context: SearchContext,
): ScholarlySearchRecommendation | null {
  const titleMatches = matchingTerms(item.title, context.terms)
  const abstractMatches = item.abstract ? matchingTerms(item.abstract, context.terms) : []
  const referenceMatches = context.referenceTitles.flatMap((referenceTitle) =>
    matchingTerms(referenceTitle, words(item.title)),
  )
  const uniqueReferenceMatches = [...new Set(referenceMatches)].slice(0, 4)
  const requiredMatches = matchingTerms(
    `${item.title} ${item.abstract ?? ""}`,
    context.requiredTerms,
  )
  const score = titleMatches.length * 3 + abstractMatches.length + uniqueReferenceMatches.length * 2
  const distinctiveTitleMatch = titleMatches.some((term) => term.length >= 8)
  const hasEnoughEvidence =
    titleMatches.length >= 2 ||
    (distinctiveTitleMatch && abstractMatches.length >= 1) ||
    uniqueReferenceMatches.length >= 2
  if (
    score === 0 ||
    !hasEnoughEvidence ||
    (context.requiredTerms.length > 0 && requiredMatches.length === 0)
  )
    return null
  const reasons: string[] = []
  if (titleMatches.length > 0) reasons.push(`제목 핵심어 일치: ${titleMatches.join(", ")}`)
  if (abstractMatches.length > 0) reasons.push(`초록 핵심어 일치: ${abstractMatches.join(", ")}`)
  if (uniqueReferenceMatches.length > 0) reasons.push("현재 문서의 참고문헌 주제와 겹침")
  return { item, score, reasons }
}

export function rankScholarlyRecommendations(
  document: DocumentRecord,
  citations: readonly CitationIndexEntry[],
  items: readonly ScholarlySearchItem[],
): readonly ScholarlySearchRecommendation[] {
  const context = contextFor(document, citations)
  const seenDois = new Set<string>()
  const seenTitles = new Set<string>()
  const recommendations: ScholarlySearchRecommendation[] = []
  for (const item of items) {
    const doi = doiKey(item)
    const title = titleKey(item)
    if ((doi && doi === context.doi) || (context.title && title === normalized(context.title)))
      continue
    if ((doi && seenDois.has(doi)) || seenTitles.has(title)) continue
    const recommendation = recommendationFor(item, context)
    if (!recommendation) continue
    if (doi) seenDois.add(doi)
    seenTitles.add(title)
    recommendations.push(recommendation)
  }
  return recommendations
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.item.citationCount ?? -1) - (left.item.citationCount ?? -1) ||
        left.item.title.localeCompare(right.item.title),
    )
    .slice(0, 10)
}
