import type { CitationAssessmentResult } from "../../shared/citationAssessment"
import type { CitationPaper } from "../../shared/ipc"
import type { BoardCard, DocumentRecord } from "../types"
import { createBoardCard } from "./board"
import type { CitationIndexEntry } from "./pdfCitationIndex"

export function saveSidebarInsight(
  cards: readonly BoardCard[],
  document: DocumentRecord,
  title: string,
  body: string,
): readonly BoardCard[] {
  const sourceKey = `sidebar:${title}`
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
      placement: { x: 1180, y: 240 + cards.length * 56 },
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
    placement: { x: 1180, y: 300 + cards.length * 56 },
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
