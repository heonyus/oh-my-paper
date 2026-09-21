import type { SourceDocumentAst } from "../../shared/documentAst"
import {
  itemIdsForRange,
  type LocalSemanticEdge,
  type LocalSemanticNode,
  makeSemanticNode,
  pageText,
  type SourceRange,
} from "./documentSemanticTypes"

export type CitationForm = "numeric" | "author_year"
export type CitationResolution = "resolved" | "ambiguous" | "unresolved"

export type BibliographyEntry = {
  readonly referenceKey: string
  readonly node: LocalSemanticNode
}

export type CitationOccurrence = LocalSemanticNode & {
  readonly form: CitationForm
  readonly referenceKeys: readonly string[]
  readonly resolution: CitationResolution
  readonly candidateNodeIds: readonly string[]
}

export type DocumentCitations = {
  readonly sourceHash: string
  readonly bibliography: readonly BibliographyEntry[]
  readonly occurrences: readonly CitationOccurrence[]
  readonly nodes: readonly LocalSemanticNode[]
  readonly edges: readonly LocalSemanticEdge[]
}

type Match = {
  readonly pageId: SourceRange["pageId"]
  readonly start: number
  readonly end: number
  readonly text: string
}

const numericEntryPattern =
  /\[(\d{1,3})\]\s+(.+?)(?=\s+\[\d{1,3}\]|\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)*\.\s+(?:19|20)\d{2}\b|$)/gu
const authorEntryPattern =
  /([A-Z][\p{L}'-]+(?:\s+(?:and|et al\.)\s+[A-Z][\p{L}'-]+)*)\.\s+((?:19|20)\d{2}[a-z]?)\.\s+(.+?)(?=\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)*\.\s+(?:19|20)\d{2}\b|$)/gu
const numericOccurrencePattern =
  /\[((?:\d{1,3}\s*(?:,|;)\s*)*\d{1,3}(?:\s*-\s*\d{1,3})?(?:\s*(?:,|;)\s*\d{1,3}(?:\s*-\s*\d{1,3})?)*)\]/gu
const parenthesizedAuthorYearPattern =
  /\(([A-Z][\p{L}'-]+(?:\s+(?:and|et al\.)\s+[A-Z][\p{L}'-]+)*),\s*((?:19|20)\d{2}[a-z]?)\)/gu
const etAlAuthorYearPattern = /\b([A-Z][\p{L}'-]+\s+et al\.)\s*\(((?:19|20)\d{2}[a-z]?)\)/gu

function referencesStart(text: string): number | null {
  const match = /\b(?:references|bibliography)\b/iu.exec(text)
  return match?.index ?? null
}

function rangeMatch(pageId: Match["pageId"], start: number, end: number, text: string): Match {
  return { pageId, start, end, text }
}

function matchesForPage(
  source: SourceDocumentAst,
  pageId: Match["pageId"],
  pattern: RegExp,
  accept: (match: RegExpExecArray) => string | null,
): readonly Match[] {
  const text = pageText(source, pageId)
  const matches: Match[] = []
  pattern.lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    const key = accept(match)
    if (!key || match.index === undefined) continue
    matches.push(rangeMatch(pageId, match.index, match.index + match[0].length, key))
  }
  return matches
}

function firstSurname(authors: string): string | null {
  const first = authors.split(/\s+(?:and|et al\.)/iu)[0]?.trim()
  const surname = first?.split(/\s+/u)[0]
  return surname ? surname.toLowerCase() : null
}

function bibliographyEntries(source: SourceDocumentAst): readonly BibliographyEntry[] {
  return source.pages.flatMap((page) => {
    const text = pageText(source, page.id)
    const start = referencesStart(text)
    if (start === null) return []
    const numeric = matchesForPage(
      source,
      page.id,
      numericEntryPattern,
      (match) => match[1] ?? null,
    )
    const authorYear = matchesForPage(source, page.id, authorEntryPattern, (match) => {
      const authors = match[1]
      const year = match[2]
      const surname = authors && firstSurname(authors)
      return surname && year ? `${surname}-${year.toLowerCase()}` : null
    })
    return [...numeric, ...authorYear]
      .filter((match) => match.start >= start)
      .flatMap((match) => {
        const ids = itemIdsForRange(source, match.pageId, match.start, match.end)
        const node = makeSemanticNode(source, "citation_reference", match.pageId, ids, 0.93, [
          "bibliography marker and source range agree",
        ])
        return node ? [{ referenceKey: match.text, node }] : []
      })
      .sort(
        (left, right) =>
          left.node.sourceRange.start - right.node.sourceRange.start ||
          left.node.id.localeCompare(right.node.id),
      )
  })
}

function expandNumericKeys(value: string): readonly string[] {
  const keys: string[] = []
  for (const token of value
    .split(/[,;]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)) {
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/u)
    if (!range?.[1] || !range[2]) {
      if (/^\d+$/u.test(token)) keys.push(token)
      continue
    }
    const first = Number.parseInt(range[1], 10)
    const last = Number.parseInt(range[2], 10)
    if (last < first || last - first > 100) continue
    for (let value = first; value <= last; value += 1) keys.push(String(value))
  }
  return [...new Set(keys)]
}

function occurrenceMatches(source: SourceDocumentAst): readonly {
  readonly form: CitationForm
  readonly match: Match
  readonly keys: readonly string[]
}[] {
  return source.pages.flatMap((page) => {
    const text = pageText(source, page.id)
    const start = referencesStart(text) ?? text.length + 1
    const numeric = matchesForPage(
      source,
      page.id,
      numericOccurrencePattern,
      (match) => match[1] ?? null,
    )
      .filter((match) => match.start < start)
      .map((match) => ({ form: "numeric" as const, match, keys: expandNumericKeys(match.text) }))
    const parenthesized = matchesForPage(
      source,
      page.id,
      parenthesizedAuthorYearPattern,
      (match) => {
        const authors = match[1]
        const year = match[2]
        const surname = authors && firstSurname(authors)
        return surname && year ? `${surname}-${year.toLowerCase()}` : null
      },
    )
      .filter((match) => match.start < start)
      .map((match) => ({ form: "author_year" as const, match, keys: [match.text] }))
    const etAl = matchesForPage(source, page.id, etAlAuthorYearPattern, (match) => {
      const authors = match[1]
      const year = match[2]
      const surname = authors && firstSurname(authors)
      return surname && year ? `${surname}-${year.toLowerCase()}` : null
    })
      .filter((match) => match.start < start)
      .map((match) => ({ form: "author_year" as const, match, keys: [match.text] }))
    return [...numeric, ...parenthesized, ...etAl].sort(
      (left, right) => left.match.start - right.match.start,
    )
  })
}

function resolutionFor(
  candidateGroups: readonly (readonly LocalSemanticNode[])[],
): CitationResolution {
  if (candidateGroups.some((group) => group.length > 1)) return "ambiguous"
  if (candidateGroups.some((group) => group.length === 0)) return "unresolved"
  return "resolved"
}

export function deriveDocumentCitations(source: SourceDocumentAst): DocumentCitations {
  const bibliography = bibliographyEntries(source)
  const occurrences: CitationOccurrence[] = []
  const edges: LocalSemanticEdge[] = []
  for (const occurrence of occurrenceMatches(source)) {
    const ids = itemIdsForRange(
      source,
      occurrence.match.pageId,
      occurrence.match.start,
      occurrence.match.end,
    )
    const base = makeSemanticNode(
      source,
      "citation_occurrence",
      occurrence.match.pageId,
      ids,
      0.91,
      ["citation marker matched in page-local normalized text"],
    )
    if (!base) continue
    const candidateGroups = occurrence.keys.map((key) =>
      bibliography.filter((entry) => entry.referenceKey === key).map((entry) => entry.node),
    )
    const candidates = candidateGroups.flat()
    const resolution = resolutionFor(candidateGroups)
    const node: CitationOccurrence = {
      ...base,
      form: occurrence.form,
      referenceKeys: occurrence.keys,
      resolution,
      candidateNodeIds: candidates.map((candidate) => candidate.id),
    }
    occurrences.push(node)
    if (resolution === "resolved") {
      for (const candidate of candidates)
        edges.push({
          from: node.id,
          to: candidate.id,
          kind: "reference",
          confidence: 0.9,
          reasons: ["exactly one bibliography candidate exists for each cited key"],
        })
    }
  }
  return {
    sourceHash: source.sourceHash,
    bibliography,
    occurrences,
    nodes: [...bibliography.map((entry) => entry.node), ...occurrences],
    edges,
  }
}
