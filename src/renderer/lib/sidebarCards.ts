import type { CitationAssessmentResult } from "../../shared/citationAssessment"
import type { CitationPaper } from "../../shared/ipc"
import { paperOrigin } from "../../shared/uiLayout"
import type { BoardCard, DocumentRecord } from "../types"
import { CARD_PAGE_GAP, CARD_WIDTH, createBoardCard } from "./board"
import type { CitationIndexEntry } from "./pdfCitationIndex"

/** Left of the paper, like every other AI card. */
const SIDEBAR_CARD_X = paperOrigin.x - CARD_PAGE_GAP - CARD_WIDTH

/**
 * `sourceTitle` names the insight whatever language `title` is shown in, so saving it again
 * updates the same card; it defaults to `title`.
 */
export function saveSidebarInsight(
  cards: readonly BoardCard[],
  document: DocumentRecord,
  title: string,
  body: string,
  sourceTitle: string = title,
): readonly BoardCard[] {
  const sourceKey = `sidebar:${sourceTitle}`
  const existing = cards.find((card) => card.sourceKey === sourceKey)
  if (existing) {
    return cards.map((card) => (card.id === existing.id ? { ...card, body } : card))
  }
  return [
    ...cards,
    createBoardCard({
      documentId: document.id,
      kind: "explanation",
      title,
      body,
      sourceKey,
      placement: { x: SIDEBAR_CARD_X, y: 240 + cards.length * 56 },
      anchor: {
        page: 1,
        quote: document.title,
        x: 720,
        y: 150,
        fragments: [{ x: 520, y: 130, width: 200, height: 28 }],
      },
    }),
  ]
}

export function saveCitationAssessment(
  cards: readonly BoardCard[],
  document: DocumentRecord,
  entry: CitationIndexEntry,
  paper: CitationPaper,
  assessment: CitationAssessmentResult,
): readonly BoardCard[] {
  const sourceKey = `citation:${paper.paperId}`
  const tier = assessment.tier.replaceAll("_", " ")
  const body = `[${tier.toUpperCase()} · ${assessment.score}]\n${assessment.citationReason}\n${assessment.readingValue}`
  const sourceMeta = {
    title: paper.title,
    authors: [...paper.authors],
    year: paper.year,
    venue: paper.venue,
    abstract: paper.abstract,
    doi: paper.doi,
    url: paper.url,
    citationCount: paper.citationCount,
    assessment,
  }
  const existing = cards.find((card) => card.sourceKey === sourceKey)
  if (existing) {
    return cards.map((card) => (card.id === existing.id ? { ...card, body, sourceMeta } : card))
  }
  const context = entry.contexts[0]
  const base = createBoardCard({
    documentId: document.id,
    kind: "citation",
    title: paper.title,
    body,
    sourceKey,
    placement: { x: SIDEBAR_CARD_X, y: 300 + cards.length * 56 },
    anchor: {
      page: context?.page ?? 1,
      quote: context?.text ?? entry.rawText,
      x: 720,
      y: 240,
      fragments: [{ x: 600, y: 226, width: 120, height: 18 }],
    },
  })
  return [
    ...cards,
    {
      ...base,
      sourceUrl: paper.openAccessUrl ?? paper.url,
      sourceMeta,
    },
  ]
}
