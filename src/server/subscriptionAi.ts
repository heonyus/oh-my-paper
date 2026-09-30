import type { z } from "zod"
import type { AiModeSettings } from "../electron/aiModeStore"
import { systemPromptFor, userInputFor } from "../electron/aiPrompts"
import type { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"
import type { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import { ProviderConfigurationError } from "../electron/providerConfigStore"
import { DEFAULT_CLAUDE_EFFORT, DEFAULT_CLAUDE_MODEL } from "../shared/claudeTypes"
import { CODEX_DEFAULT_MODEL } from "../shared/codexTypes"
import { type aiRequestSchema, aiResultSchema, type CodexReasoningEffort } from "../shared/ipc"
import { pageStructureResponseFormat } from "../shared/pageStructure"
import { pageTranslationResponseFormat } from "../shared/pageTranslationProtocol"

type AiRequest = z.infer<typeof aiRequestSchema>
type AiResult = z.infer<typeof aiResultSchema>
type Message = { readonly role: string; readonly content: string }
type ChatResult = { readonly text: string; readonly model: string }
/** Per-call options for plain chat; the JSON schema is enforced only where the runtime can. */
export type ChatOptions = {
  readonly signal?: AbortSignal | undefined
  readonly jsonSchema?: Readonly<Record<string, unknown>> | undefined
}
type StreamOptions = {
  readonly onDelta?: ((delta: string) => void) | undefined
  readonly signal?: AbortSignal | undefined
}

export const DEFAULT_CODEX_MODEL = CODEX_DEFAULT_MODEL

export function codexModelOf(settings: AiModeSettings): string {
  return settings.codexModel ?? DEFAULT_CODEX_MODEL
}

export function claudeModelOf(settings: AiModeSettings): string {
  return settings.claudeModel ?? DEFAULT_CLAUDE_MODEL
}

function flatten(messages: readonly Message[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n")
}

function requestMessages(request: AiRequest): readonly Message[] {
  return [
    { role: "system", content: systemPromptFor(request.action, request) },
    ...(request.history ?? []),
    { role: "user", content: userInputFor(request) },
  ]
}

export async function chatWithCodex(
  adapter: CodexSubscriptionAdapter | null,
  settings: AiModeSettings,
  messages: readonly Message[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  if (!adapter) throw new ProviderConfigurationError("auth")
  const model = codexModelOf(settings)
  const text = await adapter.runCompletion({
    prompt: flatten(messages),
    model,
    reasoningEffort: settings.codexReasoningEffort,
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return { text, model }
}

export async function runWithCodex(
  adapter: CodexSubscriptionAdapter | null,
  settings: AiModeSettings,
  request: AiRequest,
  options: StreamOptions = {},
): Promise<AiResult> {
  if (!adapter) throw new ProviderConfigurationError("auth")
  const model = codexModelOf(settings)
  const text = await adapter.runCompletion({
    prompt: flatten(requestMessages(request)),
    imageDataUrl: request.imageDataUrl,
    model,
    reasoningEffort: codexEffortFor(request.action, settings.codexReasoningEffort),
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return aiResultSchema.parse({ text, model })
}

/** The JSON schemas API mode enforces through `response_format`, enforced by the CLI instead. */
function claudeOutputSchema(
  action: AiRequest["action"],
): Readonly<Record<string, unknown>> | undefined {
  if (action === "page_translation") return pageTranslationResponseFormat.json_schema.schema
  if (action === "page_structure") return pageStructureResponseFormat.json_schema.schema
  return undefined
}

/**
 * Translations, titles and the paper overview, where thinking only delays the answer. On
 * Haiku 4.5 at medium effort a paragraph's translation took 110 s against 6 s without it, and
 * the three overview answers 33–90 s against 6–8 s, with answers as good. API mode keeps
 * reasoning at its lowest for these turns; the CLI's lowest is no thinking. Explanations and
 * conversations keep the effort the reader chose (an explanation took 16 s against 14 s).
 */
const QUICK_ACTIONS: ReadonlySet<AiRequest["action"]> = new Set([
  "page_translation",
  "page_structure",
  "translation",
  "card_title",
  "keywords",
  "three_line_summary",
  "paper_summary",
])

function claudeThinks(action: AiRequest["action"]): boolean {
  return !QUICK_ACTIONS.has(action)
}

/** ChatGPT mode's quick turns run at `low`, which every model accepts, unless less was chosen. */
export function codexEffortFor(
  action: AiRequest["action"],
  chosen: CodexReasoningEffort | undefined,
): CodexReasoningEffort | undefined {
  if (!QUICK_ACTIONS.has(action)) return chosen
  return chosen === "none" || chosen === "minimal" ? chosen : "low"
}

/** System messages become the CLI system prompt; the rest is sent as one user turn. */
function claudeTurn(messages: readonly Message[]): {
  readonly systemPrompt: string
  readonly prompt: string
} {
  const system = messages.filter((message) => message.role === "system")
  const turns = messages.filter((message) => message.role !== "system")
  const single = turns.length === 1 && turns[0]?.role === "user" ? turns[0].content : null
  return {
    systemPrompt:
      system.map((message) => message.content).join("\n\n") ||
      "You are a careful research assistant.",
    prompt: single ?? flatten(turns),
  }
}

export async function chatWithClaude(
  adapter: ClaudeSubscriptionAdapter | null,
  settings: AiModeSettings,
  messages: readonly Message[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  if (!adapter) throw new ProviderConfigurationError("auth")
  const model = claudeModelOf(settings)
  const text = await adapter.runCompletion({
    ...claudeTurn(messages),
    model,
    effort: settings.claudeEffort ?? DEFAULT_CLAUDE_EFFORT,
    jsonSchema: options.jsonSchema,
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return { text, model }
}

export async function runWithClaude(
  adapter: ClaudeSubscriptionAdapter | null,
  settings: AiModeSettings,
  request: AiRequest,
  options: StreamOptions = {},
): Promise<AiResult> {
  if (!adapter) throw new ProviderConfigurationError("auth")
  const model = claudeModelOf(settings)
  const text = await adapter.runCompletion({
    ...claudeTurn(requestMessages(request)),
    imageDataUrl: request.imageDataUrl,
    model,
    effort: settings.claudeEffort ?? DEFAULT_CLAUDE_EFFORT,
    thinking: claudeThinks(request.action),
    jsonSchema: claudeOutputSchema(request.action),
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return aiResultSchema.parse({ text, model })
}
