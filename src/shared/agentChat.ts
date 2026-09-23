import { z } from "zod"
import { documentIdSchema } from "./ids"

export const AGENT_QUESTION_MAX_CHARACTERS = 2_000
export const AGENT_HISTORY_MAX_MESSAGES = 20
export const AGENT_CONTEXT_DOC_MAX = 8
export const AGENT_CONTEXT_EXCERPT_CHARACTERS = 1_500
export const AGENT_SEARCH_RESULT_LIMIT = 8
export const AGENT_QUERY_MAX = 3

export const agentMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(8_000),
  })
  .readonly()

export const agentPaperProviderSchema = z.enum(["semanticscholar", "crossref", "arxiv", "openalex"])

export const agentPlanSchema = z
  .object({
    queries: z.array(z.string().trim().min(1).max(300)).min(1).max(AGENT_QUERY_MAX),
  })
  .readonly()

export const agentPaperSchema = z
  .object({
    provider: agentPaperProviderSchema,
    title: z.string().min(1).max(2_000),
    authors: z.array(z.string().min(1).max(500)).max(500).readonly(),
    year: z.number().int().min(1000).max(9999).nullable(),
    venue: z.string().max(1_000),
    landingUrl: z.string().url().nullable(),
    fullTextUrl: z.string().url().nullable(),
    citationCount: z.number().int().nonnegative().nullable(),
  })
  .readonly()

export const agentAskRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(AGENT_QUESTION_MAX_CHARACTERS),
    contextDocIds: z.array(documentIdSchema).max(AGENT_CONTEXT_DOC_MAX).default([]),
    history: z.array(agentMessageSchema).max(AGENT_HISTORY_MAX_MESSAGES).default([]),
  })
  .readonly()

export const agentAskResultSchema = z
  .object({
    answer: z.string().min(1).max(32_000),
    model: z.string().min(1),
    papers: z.array(agentPaperSchema).max(AGENT_SEARCH_RESULT_LIMIT).readonly(),
  })
  .readonly()

export const agentStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["context", "plan", "search", "fallback", "compose"]),
    status: z.enum(["running", "done", "failed"]),
    query: z.string().max(300).optional(),
    queries: z.array(z.string().max(300)).max(AGENT_QUERY_MAX).readonly().optional(),
    found: z.number().int().nonnegative().optional(),
    detail: z.string().max(500).optional(),
  })
  .readonly()

export const agentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), step: agentStepSchema }).readonly(),
  z.object({ type: z.literal("result"), result: agentAskResultSchema }).readonly(),
  z.object({ type: z.literal("error"), error: z.string().max(500) }).readonly(),
])

export const agentContextDocSchema = z
  .object({
    documentId: documentIdSchema,
    title: z.string().min(1),
    authors: z.array(z.string().min(1)).max(500).readonly(),
    year: z.number().int().min(1000).max(9999).nullable(),
    excerpt: z.string().max(8_000),
  })
  .readonly()

export const agentThreadMessageSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(32_000),
    papers: z.array(agentPaperSchema).max(AGENT_SEARCH_RESULT_LIMIT).readonly().optional(),
    steps: z.array(agentStepSchema).max(64).readonly().optional(),
  })
  .readonly()

export const agentThreadSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
    contextDocIds: z.array(documentIdSchema).max(AGENT_CONTEXT_DOC_MAX).default([]),
    messages: z.array(agentThreadMessageSchema).max(200).readonly(),
  })
  .readonly()

export type AgentMessage = z.infer<typeof agentMessageSchema>
export type AgentPlan = z.infer<typeof agentPlanSchema>
export type AgentPaper = z.infer<typeof agentPaperSchema>
export type AgentAskRequest = z.input<typeof agentAskRequestSchema>
export type AgentAskResult = z.infer<typeof agentAskResultSchema>
export type AgentStep = z.infer<typeof agentStepSchema>
export type AgentStreamEvent = z.infer<typeof agentStreamEventSchema>
export type AgentContextDoc = z.infer<typeof agentContextDocSchema>
export type AgentThreadMessage = z.infer<typeof agentThreadMessageSchema>
export type AgentThread = z.infer<typeof agentThreadSchema>

export const AGENT_SYSTEM_PROMPT = [
  "You are oh-my-paper's research agent: an assistant for reading, finding and discussing academic papers.",
  "",
  "Rules:",
  "- Answer in the same language the user writes in (Korean questions get Korean answers).",
  "- Ground paper-specific claims in the provided SEARCH RESULTS or ATTACHED LIBRARY PAPERS.",
  "- Cite sources as [n] matching the numbered search results, or [L1], [L2]... for attached library papers. Never fabricate citations, titles, authors or findings.",
  "- When the search results do not support a claim, say so honestly instead of guessing.",
  "- Be concise and structured: short paragraphs or bullet lists. Use Markdown formatting.",
  "- When the user asks to find papers, summarize what was found and what each relevant paper contributes.",
].join("\n")

export function buildAgentUserPrompt(input: {
  readonly question: string
  readonly contextDocs: readonly AgentContextDoc[]
  readonly papers: readonly AgentPaper[]
  readonly abstracts: readonly (string | null)[]
}): string {
  const parts: string[] = [`QUESTION:\n${input.question}`]
  if (input.contextDocs.length > 0) {
    const docs = input.contextDocs
      .map((doc, index) => {
        const meta = [doc.authors.slice(0, 3).join(", "), doc.year ?? "n.d."]
          .filter((v) => v !== "")
          .join(", ")
        return `[L${index + 1}] "${doc.title}" (${meta})\nexcerpt: ${doc.excerpt}`
      })
      .join("\n\n")
    parts.push(`ATTACHED LIBRARY PAPERS:\n${docs}`)
  }
  if (input.papers.length > 0) {
    const results = input.papers
      .map((paper, index) => {
        const meta = [paper.authors.slice(0, 3).join(", "), paper.year ?? "n.d.", paper.venue]
          .filter((v) => v !== "")
          .join(", ")
        const abstract = input.abstracts[index]
        const clipped = abstract && abstract.length > 600 ? `${abstract.slice(0, 600)}…` : abstract
        return `[${index + 1}] "${paper.title}" (${meta})${clipped ? `\nabstract: ${clipped}` : ""}`
      })
      .join("\n\n")
    parts.push(`SEARCH RESULTS:\n${results}`)
  }
  return parts.join("\n\n")
}

export function threadTitleFromQuestion(question: string): string {
  const trimmed = question.trim().replaceAll("\n", " ")
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
}

export function agentHistoryFromMessages(messages: readonly AgentThreadMessage[]): AgentMessage[] {
  return messages.slice(-AGENT_HISTORY_MAX_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 8_000),
  }))
}
