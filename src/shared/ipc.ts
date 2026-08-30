import { z } from "zod"
import {
  type DocumentLayoutResult,
  documentLayoutRequestSchema,
  documentLayoutResultSchema,
} from "./documentLayout"
import {
  type DocumentId,
  documentIdSchema,
  documentRecordSchema,
  type Workspace,
  workspaceSchema,
} from "./schemas"

export const preparationSteps = [
  "pdf_check",
  "register",
  "layout",
  "text_extract",
  "anchors",
  "metadata",
  "quality",
  "ready",
] as const

export const preparationUpdateSchema = z.object({
  step: z.enum(preparationSteps),
  state: z.enum(["active", "complete", "warning", "failed"]),
  message: z.string().min(1),
})

export const importResultSchema = z
  .object({
    document: documentRecordSchema,
    duplicate: z.boolean(),
  })
  .nullable()

export const documentBytesRequestSchema = z.object({ id: documentIdSchema })
export const documentBytesResultSchema = z.string().min(1)

export const workspaceReadResultSchema = workspaceSchema
export const workspaceSaveRequestSchema = workspaceSchema
export const apiKeySchema = z.string().trim().min(20).max(512)
export const providerKindSchema = z.enum(["openai", "openrouter", "opencodex"])
export const providerConfigSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("openai"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
  z.object({
    provider: z.literal("openrouter"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
  z.object({ provider: z.literal("opencodex"), model: z.string().trim().min(1).max(160) }),
])
export const providerStatusSchema = z.object({
  configured: z.boolean(),
  provider: providerKindSchema,
  model: z.string().min(1),
})
export const aiActionSchema = z.enum([
  "keywords",
  "three_line_summary",
  "paper_summary",
  "translation",
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
  sectionContext: z.string().max(4_000).optional(),
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

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:"
    } catch {
      return false
    }
  }, "Only HTTPS URLs are allowed")

export const citationLookupRequestSchema = z.object({
  key: z.string().trim().min(1).max(120),
  currentPaperTitle: z.string().trim().min(1).max(500).optional(),
  title: z.string().trim().max(500).optional(),
  authors: z.string().trim().max(500).optional(),
  year: z.number().int().min(1000).max(9999).nullable().optional(),
  doi: z.string().trim().max(300).nullable().optional(),
  context: z.string().trim().max(1_500).optional(),
})

export const citationPaperSchema = z.object({
  paperId: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string().min(1)),
  year: z.number().int().min(1000).max(9999).nullable(),
  venue: z.string(),
  abstract: z.string().nullable(),
  doi: z.string().nullable(),
  url: z.string().url().nullable(),
  openAccessUrl: z.string().url().nullable(),
  citationCount: z.number().int().nonnegative().nullable(),
})

export const citationIdentityMatchSchema = z.object({
  score: z.number().min(0).max(1),
  signals: z.array(z.string().min(1)).min(1).max(8),
  candidatesCompared: z.number().int().positive(),
})

export const citationLookupResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    paper: citationPaperSchema,
    match: citationIdentityMatchSchema,
    query: z.string().min(1),
  }),
  z.object({ status: z.literal("not_found"), paper: z.null(), query: z.string().min(1) }),
])

export const openExternalRequestSchema = z.object({ url: httpsUrlSchema })

export const ipcChannels = {
  documentImport: "document:import",
  documentBytes: "document:bytes",
  documentLayout: "document:layout",
  workspaceRead: "workspace:read",
  workspaceSave: "workspace:save",
  preparationProgress: "preparation:progress",
  providerSaveKey: "provider:save-key",
  providerSaveConfig: "provider:save-config",
  providerStatus: "provider:status",
  aiRun: "ai:run",
  aiStream: "ai:stream",
  aiStreamDelta: "ai:stream-delta",
  citationLookup: "citation:lookup",
  openExternal: "external:open",
} as const

export type ImportResult = z.infer<typeof importResultSchema>
export type PreparationUpdate = z.infer<typeof preparationUpdateSchema>
export type AiAction = z.infer<typeof aiActionSchema>
export type AiRequest = z.infer<typeof aiRequestSchema>
export type AiHistoryMessage = z.infer<typeof aiHistoryMessageSchema>
export type AiStreamDelta = z.infer<typeof aiStreamDeltaSchema>
export type ProviderConfig = z.infer<typeof providerConfigSchema>
export type ProviderStatus = z.infer<typeof providerStatusSchema>
export type CitationLookupRequest = z.infer<typeof citationLookupRequestSchema>
export type CitationLookupResult = z.infer<typeof citationLookupResultSchema>
export type CitationPaper = z.infer<typeof citationPaperSchema>
export type CitationIdentityMatch = z.infer<typeof citationIdentityMatchSchema>

export type ScourgifyApi = {
  readonly readWorkspace: () => Promise<Workspace>
  readonly saveWorkspace: (workspace: Workspace) => Promise<void>
  readonly importDocument: () => Promise<ImportResult>
  readonly readDocument: (id: DocumentId) => Promise<string>
  readonly readDocumentLayout: (id: DocumentId) => Promise<DocumentLayoutResult>
  readonly onPreparation: (listener: (update: PreparationUpdate) => void) => () => void
  readonly saveApiKey: (key: string) => Promise<void>
  readonly saveProviderConfig: (config: ProviderConfig) => Promise<void>
  readonly providerStatus: () => Promise<z.infer<typeof providerStatusSchema>>
  readonly runAi: (
    request: z.infer<typeof aiRequestSchema>,
  ) => Promise<z.infer<typeof aiResultSchema>>
  readonly streamAi: (
    request: z.infer<typeof aiRequestSchema>,
    onDelta: (delta: string) => void,
  ) => Promise<z.infer<typeof aiResultSchema>>
  readonly lookupCitation: (request: CitationLookupRequest) => Promise<CitationLookupResult>
  readonly openExternal: (request: z.infer<typeof openExternalRequestSchema>) => Promise<void>
}

export { documentLayoutRequestSchema, documentLayoutResultSchema }
