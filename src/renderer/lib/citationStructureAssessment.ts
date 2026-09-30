import { citationAssessmentResultSchema } from "../../shared/citationAssessment"
import { type Locale, translator } from "../../shared/i18n/locale"
import type { CitationPaper } from "../../shared/ipc"
import { citationMessages } from "../messages/citations"
import type { AiRequestRunner } from "../types"
import {
  citationAssessmentInput,
  citationLookupRequest,
  parseCitationAssessment,
  rankCitationAssessments,
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
  readonly onAiRequest: AiRequestRunner
  readonly onMetadata: (paper: CitationPaper) => void
  /** The language of the card body's headings; Korean when not given. */
  readonly locale?: Locale | undefined
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
  const lookup = await window.ohmypaper.lookupCitation(
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
    const t = translator(citationMessages, input.locale ?? "ko")
    return {
      status: "assessed",
      paper: lookup.paper,
      assessment,
      body: [
        `## ${t("citation.body.verdict")}`,
        `- **${t("citation.body.level")}:** ${t(`citation.tier.${ranked.tier}`)}`,
        `- **${t("citation.body.score")}:** ${ranked.score}/100`,
        "",
        `## ${t("citation.body.role")}`,
        assessment.citationReason,
        "",
        `## ${t("citation.body.value")}`,
        assessment.readingValue,
        assessment.reasons.length
          ? `\n## ${t("citation.body.reasons")}\n${assessment.reasons.map((reason) => `- ${reason}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }
  } catch {
    return { status: "metadata_only", paper: lookup.paper }
  }
}
