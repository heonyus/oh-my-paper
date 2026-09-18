import { z } from "zod"
import { createAiCacheKey } from "./aiCacheKey"

const candidateSchema = z
  .object({
    verified: z.literal(true),
    paperId: z.string().min(1).max(200),
    title: z.string().min(1).max(500),
    authors: z.array(z.string().min(1).max(200)).min(1).max(64),
    year: z.number().int().min(1000).max(9999).nullable().optional(),
  })
  .strict()

export const citationAssessmentInputSchema = z
  .object({
    citationContext: z.string().min(1).max(8_000),
    candidate: candidateSchema.nullable(),
  })
  .strict()

export type CitationAssessmentInput = z.infer<typeof citationAssessmentInputSchema>
export type VerifiedCitationCandidate = z.infer<typeof candidateSchema>

export class CitationAssessmentInputError extends Error {
  readonly name = "CitationAssessmentInputError"

  constructor(readonly reason: "unverified_citation_candidate") {
    super(reason)
  }
}

export function validateCitationAssessmentInput(
  input: CitationAssessmentInput,
): CitationAssessmentInput & { readonly candidate: VerifiedCitationCandidate } {
  const candidate = input.candidate
  if (!candidate) throw new CitationAssessmentInputError("unverified_citation_candidate")
  return { ...input, candidate }
}

export function citationAssessmentCacheKey(
  sourceHash: string,
  input: CitationAssessmentInput & { readonly candidate: VerifiedCitationCandidate },
  provider: string,
  model: string,
  policyVersion: string,
): string {
  return createAiCacheKey({
    sourceHash,
    action: "citation",
    provider,
    model,
    promptVersion: "citation-v1",
    policyVersion,
    content: JSON.stringify(input),
  })
}
