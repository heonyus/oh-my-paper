import { z } from "zod"
import {
  aiJobEventSchema,
  aiJobIdSchema,
  aiPoolSchema,
  aiPrioritySchema,
  aiRoleSchema,
} from "./documentAiJobs"
import { documentIdSchema } from "./schemas"

export const aiActionSchema = z.enum([
  "keywords",
  "three_line_summary",
  "paper_summary",
  "translation",
  "page_structure",
  "page_translation",
  "explanation",
  "infographic",
  "section",
  "figure",
  "table",
  "equation",
  "citation",
  "citation_assessment",
  "citation_chat",
  "chat",
  "card_title",
  "auto_highlight",
])
export const aiHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4_000),
})
export const AI_CONTEXT_MAX_CHARACTERS = 8_000
export const aiRequestSchema = z.object({
  action: aiActionSchema,
  documentId: documentIdSchema,
  page: z.number().int().positive(),
  quote: z.string().min(1).max(AI_CONTEXT_MAX_CHARACTERS),
  before: z.string().max(AI_CONTEXT_MAX_CHARACTERS),
  after: z.string().max(3_000),
  paperContext: z.string().max(AI_CONTEXT_MAX_CHARACTERS).optional(),
  sectionContext: z.string().max(AI_CONTEXT_MAX_CHARACTERS).optional(),
  sourceEvidence: z.string().max(12_000).optional(),
  featureKind: z
    .enum(["heading", "subheading", "figure", "table", "equation", "citation"])
    .optional(),
  imageDataUrl: z.string().startsWith("data:image/").max(8_000_000).optional(),
  history: z.array(aiHistoryMessageSchema).max(24).optional(),
})
export const aiResultSchema = z.object({ text: z.string().min(1), model: z.string().min(1) })
export const aiStreamRequestSchema = z.object({
  id: z.string().uuid(),
  request: aiRequestSchema,
})
export const aiStreamDeltaSchema = z.object({
  id: z.string().uuid(),
  delta: z.string().min(1).max(32_000),
})
export const aiJobStartRequestSchema = z.object({
  jobId: aiJobIdSchema,
  role: aiRoleSchema,
  documentId: documentIdSchema,
  sourceGeneration: z.number().int().nonnegative(),
  parents: z.array(aiJobIdSchema).max(16).default([]),
  priority: aiPrioritySchema,
  pool: aiPoolSchema,
  request: aiRequestSchema,
})
export const aiJobStartResultSchema = z.object({ jobId: aiJobIdSchema })
export const aiJobCancelRequestSchema = z.object({ jobId: aiJobIdSchema })

export type AiAction = z.infer<typeof aiActionSchema>
export type AiRequest = z.infer<typeof aiRequestSchema>
export type AiHistoryMessage = z.infer<typeof aiHistoryMessageSchema>
export type AiStreamDelta = z.infer<typeof aiStreamDeltaSchema>
export type AiJobStartRequest = z.infer<typeof aiJobStartRequestSchema>
export type AiJobEvent = z.infer<typeof aiJobEventSchema>

export { aiJobEventSchema }
