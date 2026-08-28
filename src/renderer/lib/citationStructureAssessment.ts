import { citationAssessmentResultSchema } from "../../shared/citationAssessment"
import type { AiRequest, CitationPaper } from "../../shared/ipc"
import {
  citationAssessmentInput,
  citationLookupRequest,
  parseCitationAssessment,
  rankCitationAssessments,
  readingTierLabel,
} from "./citationTriage"
import type { CitationIndexEntry } from "./pdfCitationIndex"
import type { DetectedStructure } from "./structureDetector"

type CitationStructureResult =
  | { readonly status: "not_found" }
  | { readonly status: "metadata_only"; readonly paper: CitationPaper }
  | {
      readonly status: "assessed"
      readonly paper: CitationPaper
      readonly assessment: ReturnType<typeof citationAssessmentResultSchema.parse>
      readonly body: string
    }

function entryFor(structure: DetectedStructure): CitationIndexEntry {
  const reference = structure.reference
  return {
    key: reference?.key ?? structure.title,
    title: reference?.title ?? structure.title,
    authors: reference?.authors ?? "",
    year: reference?.year ?? null,
    venue: reference?.venue ?? "",
    rawText: reference?.rawText ?? structure.quote,
    doi: reference?.rawText.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/iu)?.[0] ?? null,
    contexts: [{ page: structure.page, text: structure.quote }],
  }
}

export async function assessCitationStructure(
  structure: DetectedStructure,
  currentPaperTitle: string,
  onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>,
): Promise<CitationStructureResult> {
  const entry = entryFor(structure)
  const lookup = await window.scourgify.lookupCitation(citationLookupRequest(entry))
  if (lookup.status !== "found") return { status: "not_found" }
  try {
    const raw = await onAiRequest({
      action: "citation_assessment",
      page: structure.page,
      quote: citationAssessmentInput(currentPaperTitle, entry, lookup.paper, lookup.match),
      before: "",
      after: "",
      featureKind: "citation",
    })
    const ai = parseCitationAssessment(raw)
    const ranked = rankCitationAssessments([{ id: structure.id, assessment: ai }])[0]
    if (!ranked) return { status: "metadata_only", paper: lookup.paper }
    const assessment = citationAssessmentResultSchema.parse({
      ...ai,
      score: ranked.score,
      tier: ranked.tier,
    })
    return {
      status: "assessed",
      paper: lookup.paper,
      assessment,
      body: `[${readingTierLabel[ranked.tier]} · ${ranked.score}]\n${assessment.citationReason}\n${assessment.readingValue}`,
    }
  } catch {
    return { status: "metadata_only", paper: lookup.paper }
  }
}
