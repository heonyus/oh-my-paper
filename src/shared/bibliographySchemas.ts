import { z } from "zod"
import { knowledgeNodeIdSchema, knowledgeNodeSchema } from "./knowledgeSchemas"

export const bibliographyReadingStateSchema = z.enum(["unread", "reading", "read"])
export const bibliographyDuplicateReasonSchema = z.enum(["doi", "arxiv"])
export const citationKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9:_-]*$/u)

const nullableIdentifierSchema = z.string().trim().min(1).max(300).nullable()

const bibliographyMetadataObjectSchema = z.object({
  citationKey: citationKeySchema,
  authors: z.array(z.string().trim().min(1).max(300)).max(64),
  year: z.number().int().min(1000).max(9999).nullable(),
  doi: nullableIdentifierSchema,
  arxivId: z.string().trim().min(1).max(80).nullable(),
  venue: z.string().trim().max(500),
  tags: z.array(z.string().trim().min(1).max(100)).max(64),
  readingState: bibliographyReadingStateSchema,
})

export const bibliographyMetadataSchema = bibliographyMetadataObjectSchema.readonly()

export const bibliographyPaperSchema = z
  .object({
    node: knowledgeNodeSchema.extend({ kind: z.literal("paper") }),
    metadata: bibliographyMetadataSchema,
  })
  .readonly()

export const bibliographyUpdateInputSchema = bibliographyMetadataObjectSchema
  .omit({ citationKey: true })
  .extend({
    paperNodeId: knowledgeNodeIdSchema,
    title: z.string().trim().min(1).max(2_000),
  })
  .readonly()

export const bibliographyDuplicatePreviewInputSchema = z
  .object({
    paperNodeId: knowledgeNodeIdSchema,
    doi: nullableIdentifierSchema,
    arxivId: z.string().trim().min(1).max(80).nullable(),
  })
  .readonly()

export const bibliographyDuplicateCandidateSchema = z
  .object({
    paperNodeId: knowledgeNodeIdSchema,
    title: z.string().min(1).max(2_000),
    reasons: z.array(bibliographyDuplicateReasonSchema).min(1).max(2),
  })
  .readonly()

export const bibliographyDuplicatePreviewSchema = z
  .object({ candidates: z.array(bibliographyDuplicateCandidateSchema).max(100) })
  .readonly()

export const bibliographyExportInputSchema = z
  .object({ paperNodeIds: z.array(knowledgeNodeIdSchema).min(1).max(64) })
  .readonly()

export const bibliographyExportResultSchema = z
  .object({
    fileName: z.literal("references.bib"),
    content: z.string().min(1).max(500_000),
    count: z.number().int().positive().max(64),
  })
  .readonly()

export type BibliographyMetadata = z.infer<typeof bibliographyMetadataSchema>
export type BibliographyPaper = z.infer<typeof bibliographyPaperSchema>
export type BibliographyUpdateInput = z.infer<typeof bibliographyUpdateInputSchema>
export type BibliographyDuplicatePreviewInput = z.infer<
  typeof bibliographyDuplicatePreviewInputSchema
>
export type BibliographyDuplicateCandidate = z.infer<typeof bibliographyDuplicateCandidateSchema>
export type BibliographyDuplicatePreview = z.infer<typeof bibliographyDuplicatePreviewSchema>
export type BibliographyExportInput = z.infer<typeof bibliographyExportInputSchema>
export type BibliographyExportResult = z.infer<typeof bibliographyExportResultSchema>
