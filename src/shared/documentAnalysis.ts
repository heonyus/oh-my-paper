import { z } from "zod"
import { documentPageParseStageSchema } from "./documentPageModel"
import { documentIdSchema } from "./schemas"

const documentAnalysisBaseSchema = z.object({
  id: documentIdSchema,
  title: z.string().trim().min(1).max(512),
  pageCount: z.number().int().positive(),
})

export const documentAnalysisJobSchema = z.discriminatedUnion("state", [
  documentAnalysisBaseSchema.extend({
    state: z.literal("queued"),
    completedPages: z.number().int().nonnegative(),
  }),
  documentAnalysisBaseSchema.extend({
    state: z.literal("running"),
    completedPages: z.number().int().nonnegative(),
    currentPage: z.number().int().positive(),
    stage: documentPageParseStageSchema,
    engine: z.enum(["local", "mistral"]),
    attempt: z.number().int().positive(),
    maxAttempts: z.number().int().positive(),
  }),
  documentAnalysisBaseSchema.extend({
    state: z.literal("complete"),
    completedPages: z.number().int().positive(),
  }),
  documentAnalysisBaseSchema.extend({
    state: z.literal("failed"),
    completedPages: z.number().int().nonnegative(),
    message: z.string().trim().min(1).max(300),
  }),
])

export const documentAnalysisSnapshotSchema = z.array(documentAnalysisJobSchema).max(64).readonly()
export const documentAnalysisRequestSchema = z.object({ id: documentIdSchema })

export type DocumentAnalysisJob = z.infer<typeof documentAnalysisJobSchema>
export type DocumentAnalysisSnapshot = z.infer<typeof documentAnalysisSnapshotSchema>
