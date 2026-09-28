import type { MeaningSearchResult } from "../../shared/meaningSearch"
import type { DocumentId } from "../../shared/schemas"
import { loadParsedDocumentPage } from "./documentPageRuntime"
import { type PageParagraph, pageParagraphs } from "./noteSourceParagraphs"

const MAX_SOURCES = 120

/**
 * A match is shown only when it is clearly the best: close enough, and ahead of the next. On a
 * 25-note check against a real paper this showed the right paragraph for 13 of 21 notes, a wrong
 * one for none, and nothing for the 4 notes the paper does not discuss. A lower score floor let
 * wrong paragraphs and unrelated notes through; a lead of 0.05 hid a right one at 0.045.
 */
export const SOURCE_SCORE_MIN = 0.4
export const SOURCE_LEAD_MIN = 0.04
/** Passages handed to the tutor may be looser: it reads them, the reader never sees a claim. */
const RELATED_SCORE_MIN = 0.3

export type NoteSource = PageParagraph

export type ScoredSource = NoteSource & { readonly score: number }

/** Pages nearest the one being read first: the reader usually writes about what is in view. */
export function notePageWindow(currentPage: number, pageCount: number): readonly number[] {
  const pages: number[] = []
  for (const offset of [0, 1, -1, 2, -2]) {
    const page = currentPage + offset
    if (page >= 1 && page <= pageCount) pages.push(page)
  }
  return pages
}

export async function noteSourceCandidates(
  documentId: DocumentId,
  currentPage: number,
  pageCount: number,
  signal?: AbortSignal,
): Promise<readonly NoteSource[]> {
  const sources: NoteSource[] = []
  for (const pageNumber of notePageWindow(currentPage, pageCount)) {
    const page = await loadParsedDocumentPage(documentId, pageNumber, {
      preparedOnly: true,
      signal,
    })
    if (page) sources.push(...pageParagraphs(page))
  }
  return sources.slice(0, MAX_SOURCES)
}

/** What is embedded for a source: its section heading, when known, then its text. */
export function sourceSearchText(source: NoteSource): string {
  return source.heading ? `${source.heading}: ${source.text}` : source.text
}

function scored(
  results: MeaningSearchResult["results"],
  sources: readonly NoteSource[],
): readonly ScoredSource[] {
  const byId = new Map(sources.map((source) => [source.id, source]))
  return results.flatMap((result) => {
    const source = byId.get(result.id)
    return source ? [{ ...source, score: result.score }] : []
  })
}

/** The one passage a note sentence clearly rests on, or null when the ranking is ambiguous. */
export function confidentSource(
  results: MeaningSearchResult["results"],
  sources: readonly NoteSource[],
): ScoredSource | null {
  const [first, second] = scored(results, sources)
  if (!first || first.score < SOURCE_SCORE_MIN) return null
  if (second && first.score - second.score < SOURCE_LEAD_MIN) return null
  return first
}

export function relatedSources(
  results: MeaningSearchResult["results"],
  sources: readonly NoteSource[],
  limit = 3,
): readonly ScoredSource[] {
  return scored(results, sources)
    .filter((source) => source.score >= RELATED_SCORE_MIN)
    .slice(0, limit)
}
