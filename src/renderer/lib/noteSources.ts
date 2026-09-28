import type { ParsedPageBlock } from "../../shared/documentPageModel"
import type { MeaningSearchResult } from "../../shared/meaningSearch"
import type { DocumentId } from "../../shared/schemas"
import { loadParsedDocumentPage } from "./documentPageRuntime"

const MAX_SOURCES = 80
const MAX_SOURCE_CHARACTERS = 1_600
const MIN_SOURCE_CHARACTERS = 40
const SOURCE_LABELS: ReadonlySet<ParsedPageBlock["label"]> = new Set([
  "text",
  "list",
  "figure_title",
  "table_title",
])

/** A match is shown only when it is clearly the best: close enough, and ahead of the next. */
export const SOURCE_SCORE_MIN = 0.4
export const SOURCE_LEAD_MIN = 0.05
/** Passages handed to the tutor may be looser: it reads them, the reader never sees a claim. */
const RELATED_SCORE_MIN = 0.3

export type NoteSource = {
  /** The parsed block ID, which also keys the page's cached translation. */
  readonly id: string
  readonly page: number
  readonly text: string
}

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
    if (!page) continue
    const blocks = [...page.blocks].sort((left, right) => left.order - right.order)
    for (const block of blocks) {
      if (!SOURCE_LABELS.has(block.label)) continue
      const text = block.content.replace(/\s+/gu, " ").trim()
      if (text.length < MIN_SOURCE_CHARACTERS) continue
      sources.push({ id: block.id, page: pageNumber, text: text.slice(0, MAX_SOURCE_CHARACTERS) })
      if (sources.length >= MAX_SOURCES) return sources
    }
  }
  return sources
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
