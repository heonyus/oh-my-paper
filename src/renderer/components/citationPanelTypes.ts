import type { CitationAiAssessment } from "../../shared/citationAssessment"
import type { CitationIdentityMatch, CitationPaper } from "../../shared/ipc"

export type CitationAnalysisState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "complete"
      readonly paper: CitationPaper
      readonly match: CitationIdentityMatch
      readonly assessment: CitationAiAssessment
    }

export type CompleteCitationAnalysis = Extract<
  CitationAnalysisState,
  { readonly status: "complete" }
>
