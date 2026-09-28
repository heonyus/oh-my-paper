import type { z } from "zod"
import type { AiModeSettings } from "../electron/aiModeStore"
import { systemPromptFor, userInputFor } from "../electron/aiPrompts"
import type { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"
import type { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import { ProviderConfigurationError } from "../electron/providerConfigStore"
import { DEFAULT_CLAUDE_EFFORT, DEFAULT_CLAUDE_MODEL } from "../shared/claudeTypes"
import { type aiRequestSchema, aiResultSchema } from "../shared/ipc"

type AiRequest = z.infer<typeof aiRequestSchema>
type AiResult = z.infer<typeof aiResultSchema>
type Message = { readonly role: string; readonly content: string }
type ChatResult = { readonly text: string; readonly model: string }
type StreamOptions = {
  readonly onDelta?: ((delta: string) => void) | undefined
  readonly signal?: AbortSignal | undefined
}

export const DEFAULT_CODEX_MODEL = "gpt-5.6-sol"

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
    { role: "system", content: systemPromptFor(request.action) },
    ...(request.history ?? []),
    { role: "user", content: userInputFor(request) },
  ]
}

export async function chatWithCodex(
  adapter: CodexSubscriptionAdapter | null,
  settings: AiModeSettings,
  messages: readonly Message[],
): Promise<ChatResult> {
  if (!adapter) throw new ProviderConfigurationError("auth")
  const model = codexModelOf(settings)
  const text = await adapter.runCompletion({
    prompt: flatten(messages),
    model,
    reasoningEffort: settings.codexReasoningEffort,
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
    reasoningEffort: settings.codexReasoningEffort,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return aiResultSchema.parse({ text, model })
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
): Promise<ChatResult> {
  if (!adapter) throw new ProviderConfigurationError("auth")
  const model = claudeModelOf(settings)
  const text = await adapter.runCompletion({
    ...claudeTurn(messages),
    model,
    effort: settings.claudeEffort ?? DEFAULT_CLAUDE_EFFORT,
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
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return aiResultSchema.parse({ text, model })
}
