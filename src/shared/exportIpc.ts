import { z } from "zod"
import { knowledgeNodeIdSchema } from "./knowledgeSchemas"
import { sha256Schema } from "./schemas"

export const exportFormatSchema = z.enum(["markdown", "html", "docx", "pdf"])

export const exportPreviewRequestSchema = z.object({ nodeId: knowledgeNodeIdSchema }).strict()

export const exportSaveRequestSchema = z
  .object({
    nodeId: knowledgeNodeIdSchema,
    revision: sha256Schema,
    format: exportFormatSchema,
  })
  .strict()

export const exportPreviewSchema = z
  .object({
    nodeId: knowledgeNodeIdSchema,
    title: z.string().min(1).max(2_000),
    revision: sha256Schema,
    recordCount: z.number().int().nonnegative(),
    assetCount: z.number().int().nonnegative(),
    bibliographyCount: z.number().int().nonnegative(),
    sourceCount: z.number().int().nonnegative(),
    limitationCount: z.number().int().nonnegative(),
  })
  .strict()

export const exportSaveResultSchema = z
  .object({ saved: z.boolean(), fileName: z.string().min(1).nullable() })
  .strict()

export const exportChannels = {
  preview: "export:preview",
  save: "export:save",
} as const

export type ExportFormat = z.infer<typeof exportFormatSchema>
export type ExportPreview = z.infer<typeof exportPreviewSchema>
export type ExportSaveRequest = z.infer<typeof exportSaveRequestSchema>
export type ExportSaveResult = z.infer<typeof exportSaveResultSchema>

export type ExportApi = {
  readonly preview: (nodeId: z.infer<typeof knowledgeNodeIdSchema>) => Promise<ExportPreview>
  readonly save: (request: ExportSaveRequest) => Promise<ExportSaveResult>
}
