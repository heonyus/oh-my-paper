import {
  type CitationAiAssessment,
  citationAiAssessmentSchema,
  type ReadingTier,
} from "../../shared/citationAssessment"
import type { CitationIdentityMatch, CitationLookupRequest, CitationPaper } from "../../shared/ipc"
import type { CitationIndexEntry } from "./pdfCitationIndex"

export function parseCitationAssessment(value: string): CitationAiAssessment {
  const trimmed = value.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim()
  return citationAiAssessmentSchema.parse(JSON.parse(withoutFence))
}

export function citationAssessmentScore(assessment: CitationAiAssessment): number {
  const scores = assessment.breakdown
  return (
    scores.dependency +
    scores.methodological +
    scores.conceptual +
    scores.evidentiary +
    scores.contextSufficiency
  )
}

export type CitationTriageCandidate = {
  readonly id: string
  readonly assessment: CitationAiAssessment
}

export type RankedCitation = {
  readonly id: string
  readonly score: number
  readonly tier: ReadingTier
}

export const readingTierLabel: Readonly<Record<ReadingTier, string>> = {
  deep_read: "정독",
  skim: "훑어보기",
  abstract_only: "초록만",
  pass: "패스",
}

export function rankCitationAssessments(
  candidates: readonly CitationTriageCandidate[],
): readonly RankedCitation[] {
  const sorted = candidates
    .map((candidate) => ({ ...candidate, score: citationAssessmentScore(candidate.assessment) }))
    .sort(
      (left, right) =>
        right.score - left.score || right.assessment.confidence - left.assessment.confidence,
    )
  const count = sorted.length
  const deepQuota = count >= 20 ? Math.max(1, Math.floor(count * 0.05)) : 1
  const skimQuota = Math.max(1, Math.floor(count * 0.15))
  const abstractQuota = Math.max(1, Math.floor(count * 0.25))
  let deep = 0
  let skim = 0
  let abstractOnly = 0

  return sorted.map(({ id, score }) => {
    if (deep < deepQuota && score >= (count < 20 ? 96 : 88)) {
      deep += 1
      return { id, score, tier: "deep_read" }
    }
    if (skim < skimQuota && score >= 68) {
      skim += 1
      return { id, score, tier: "skim" }
    }
    if (abstractOnly < abstractQuota && score >= 42) {
      abstractOnly += 1
      return { id, score, tier: "abstract_only" }
    }
    return { id, score, tier: "pass" }
  })
}

export function citationLookupRequest(
  entry: CitationIndexEntry,
  currentPaperTitle?: string,
): CitationLookupRequest {
  const context = entry.contexts
    .map((item) => item.text)
    .join("\n")
    .slice(0, 1_500)
  return {
    key: entry.key,
    ...(currentPaperTitle ? { currentPaperTitle } : {}),
    title: entry.title,
    authors: entry.authors,
    year: entry.year,
    doi: entry.doi,
    ...(context ? { context } : {}),
  }
}

export function citationAssessmentInput(
  currentPaperTitle: string,
  entry: CitationIndexEntry,
  paper: CitationPaper,
  match: CitationIdentityMatch,
): string {
  return [
    `CURRENT PAPER: ${currentPaperTitle}`,
    `VERIFIED CITED PAPER: ${paper.title}`,
    `AUTHORS: ${paper.authors.join(", ")}`,
    `YEAR/VENUE: ${paper.year ?? "unknown"} / ${paper.venue || "unknown"}`,
    `IDENTITY CONFIDENCE: ${Math.round(match.score * 100)}% (${match.signals.join(", ")})`,
    `ABSTRACT: ${paper.abstract ?? "Unavailable"}`,
    "CITATION CONTEXTS:",
    ...entry.contexts.map((context) => `- Page ${context.page}: ${context.text}`),
  ]
    .join("\n")
    .slice(0, 4_000)
}
