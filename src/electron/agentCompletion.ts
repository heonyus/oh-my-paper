import type { Locale } from "../shared/i18n/locale"
export type AgentCompletionMessage = {
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

export type AgentCompletionOptions = {
  readonly signal?: AbortSignal | undefined
  /** A JSON Schema the runtime enforces when it can (Claude CLI); others follow the prompt. */
  readonly jsonSchema?: Readonly<Record<string, unknown>> | undefined
}

export type AgentCompletion = (
  messages: readonly AgentCompletionMessage[],
  options?: AgentCompletionOptions,
) => Promise<{ readonly text: string; readonly model: string }>

/** Extracts the first JSON object from model output, tolerating code fences and prose. */
export function parseJsonObject(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/giu, "")
  const start = unfenced.indexOf("{")
  const end = unfenced.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export function writesKorean(text: string): boolean {
  return /[ㄱ-ㆎ가-힣]/u.test(text)
}

/** The app's language when the request names one, else the language of the question. */
export function answerLanguage(text: string, language?: Locale): string {
  if (language === "ko") return "Korean"
  if (language === "en") return "English"
  return writesKorean(text) ? "Korean" : "the same language as the user's question"
}
