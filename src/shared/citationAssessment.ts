import { z } from "zod"

export const readingTierSchema = z.enum(["deep_read", "skim", "abstract_only", "pass"])

export const citationScoreBreakdownSchema = z
  .object({
    dependency: z.number().int().min(0).max(30),
    methodological: z.number().int().min(0).max(25),
    conceptual: z.number().int().min(0).max(20),
    evidentiary: z.number().int().min(0).max(15),
    contextSufficiency: z.number().int().min(0).max(10),
  })
  .strict()

export const citationAiAssessmentSchema = z
  .object({
    breakdown: citationScoreBreakdownSchema,
    confidence: z.number().min(0).max(1),
    citationReason: z.string().min(1).max(2_000),
    readingValue: z.string().min(1).max(2_000),
    reasons: z.array(z.string().min(1).max(500)).min(1).max(6),
    recommendedSections: z
      .array(
        z.enum([
          "abstract",
          "introduction",
          "method",
          "results",
          "discussion",
          "appendix",
          "full_text",
        ]),
      )
      .max(7),
    limitations: z.array(z.string().min(1).max(500)).max(5),
  })
  .strict()

export const citationAssessmentResultSchema = citationAiAssessmentSchema.extend({
  score: z.number().int().min(0).max(100),
  tier: readingTierSchema,
})

export type ReadingTier = z.infer<typeof readingTierSchema>
export type CitationAiAssessment = z.infer<typeof citationAiAssessmentSchema>
export type CitationAssessmentResult = z.infer<typeof citationAssessmentResultSchema>
