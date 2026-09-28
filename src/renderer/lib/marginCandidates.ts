import type { ParsedPageBlock } from "../../shared/documentPageModel"
import type { DocumentId } from "../../shared/schemas"
import { loadParsedDocumentPage } from "./documentPageRuntime"

/** Jev accepts at most 32 candidates and 64k characters per decision, note included. */
const MAX_CANDIDATES = 32
const MAX_CANDIDATE_CHARACTERS = 1_600
const MAX_TOTAL_CHARACTERS = 48_000
const MIN_CANDIDATE_CHARACTERS = 40
const CANDIDATE_LABELS: ReadonlySet<ParsedPageBlock["label"]> = new Set([
  "text",
  "list",
  "figure_title",
  "table_title",
])

export type MarginCandidate = {
  readonly id: string
  readonly page: number
  readonly text: string
}

/** Pages nearest the one being read first: the reader usually writes about what is in view. */
export function marginPageWindow(currentPage: number, pageCount: number): readonly number[] {
  const pages: number[] = []
  for (const offset of [0, 1, -1, 2, -2]) {
    const page = currentPage + offset
    if (page >= 1 && page <= pageCount) pages.push(page)
  }
  return pages
}

export async function marginCandidates(
  documentId: DocumentId,
  currentPage: number,
  pageCount: number,
  signal?: AbortSignal,
): Promise<readonly MarginCandidate[]> {
  const candidates: MarginCandidate[] = []
  let total = 0
  for (const pageNumber of marginPageWindow(currentPage, pageCount)) {
    const page = await loadParsedDocumentPage(documentId, pageNumber, {
      preparedOnly: true,
      signal,
    })
    if (!page) continue
    const blocks = [...page.blocks].sort((left, right) => left.order - right.order)
    for (const block of blocks) {
      if (!CANDIDATE_LABELS.has(block.label)) continue
      const text = block.content.replace(/\s+/gu, " ").trim()
      if (text.length < MIN_CANDIDATE_CHARACTERS) continue
      const bounded = text.slice(0, MAX_CANDIDATE_CHARACTERS)
      if (candidates.length >= MAX_CANDIDATES || total + bounded.length > MAX_TOTAL_CHARACTERS)
        return candidates
      candidates.push({ id: `p${pageNumber}-b${block.order}`, page: pageNumber, text: bounded })
      total += bounded.length
    }
  }
  return candidates
}
