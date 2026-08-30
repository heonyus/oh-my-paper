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

type CitationStructureAssessmentInput = {
  readonly structure: DetectedStructure
  readonly currentPaperTitle: string
  readonly onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>
  readonly onMetadata: (paper: CitationPaper) => void
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
  input: CitationStructureAssessmentInput,
): Promise<CitationStructureResult> {
  const entry = entryFor(input.structure)
  const lookup = await window.scourgify.lookupCitation(
    citationLookupRequest(entry, input.currentPaperTitle),
  )
  if (lookup.status !== "found") return { status: "not_found" }
  input.onMetadata(lookup.paper)
  try {
    const raw = await input.onAiRequest({
      action: "citation_assessment",
      page: input.structure.page,
      quote: citationAssessmentInput(input.currentPaperTitle, entry, lookup.paper, lookup.match),
      before: "",
      after: "",
      featureKind: "citation",
    })
    const ai = parseCitationAssessment(raw)
    const ranked = rankCitationAssessments([{ id: input.structure.id, assessment: ai }])[0]
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
      body: [
        `## 읽기 판단`,
        `- **권장 수준:** ${readingTierLabel[ranked.tier]}`,
        `- **읽기 점수:** ${ranked.score}/100`,
        "",
        "## 현재 논문에서의 역할",
        assessment.citationReason,
        "",
        "## 읽을 가치",
        assessment.readingValue,
        assessment.reasons.length
          ? `\n## 근거\n${assessment.reasons.map((reason) => `- ${reason}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }
  } catch {
    return { status: "metadata_only", paper: lookup.paper }
  }
}
