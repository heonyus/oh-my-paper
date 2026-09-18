import { z } from "zod"
import {
  researchJobIdSchema,
  researchJobSnapshotSchema,
  researchPreviewInputSchema,
} from "./researchJobSchemas"

export const researchChannels = {
  list: "research:list",
  preview: "research:preview",
  status: "research:status",
  start: "research:start",
  cancel: "research:cancel",
  resume: "research:resume",
  saveReport: "research:save-report",
}

export const researchPreviewRequestSchema = z
  .object({ input: researchPreviewInputSchema })
  .readonly()
export const researchJobRequestSchema = z.object({ jobId: researchJobIdSchema }).readonly()
export const researchSaveReportRequestSchema = z
  .object({
    jobId: researchJobIdSchema,
    title: z.string().trim().min(1).max(500),
    markdown: z
      .string()
      .min(1)
      .max(2 * 1024 * 1024),
  })
  .readonly()
export const researchJobResultSchema = researchJobSnapshotSchema
export const researchStatusResultSchema = researchJobSnapshotSchema.nullable()
export const researchListResultSchema = z.array(researchJobSnapshotSchema).max(100).readonly()

export interface ResearchApi {
  readonly list: () => Promise<z.infer<typeof researchListResultSchema>>
  readonly preview: (
    request: z.input<typeof researchPreviewRequestSchema>,
  ) => Promise<z.infer<typeof researchJobResultSchema>>
  readonly status: (
    request: z.input<typeof researchJobRequestSchema>,
  ) => Promise<z.infer<typeof researchStatusResultSchema>>
  readonly start: (
    request: z.input<typeof researchJobRequestSchema>,
  ) => Promise<z.infer<typeof researchJobResultSchema>>
  readonly cancel: (
    request: z.input<typeof researchJobRequestSchema>,
  ) => Promise<z.infer<typeof researchJobResultSchema>>
  readonly resume: (
    request: z.input<typeof researchJobRequestSchema>,
  ) => Promise<z.infer<typeof researchJobResultSchema>>
  readonly saveReport: (
    request: z.input<typeof researchSaveReportRequestSchema>,
  ) => Promise<z.infer<typeof researchJobResultSchema>>
}
