import { z } from "zod"
import type { Locale } from "./i18n/locale"

export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5"

/** The models on offer by name; `claudeModelChoices` marks the default in the reader's language. */
export const CLAUDE_MODEL_OPTIONS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-opus-5", label: "Claude Opus 5" },
] as const

const DEFAULT_MARK: Readonly<Record<Locale, string>> = { ko: "기본", en: "default" }
const SAVED_MARK: Readonly<Record<Locale, string>> = { ko: "저장된 모델", en: "saved model" }

/** The model choices, keeping a saved model that is no longer listed so the select shows it. */
export function claudeModelChoices(
  selected: string,
  locale: Locale = "ko",
): ReadonlyArray<{ readonly id: string; readonly label: string }> {
  const choices = CLAUDE_MODEL_OPTIONS.map(({ id, label }) => ({
    id,
    label: id === DEFAULT_CLAUDE_MODEL ? `${label} (${DEFAULT_MARK[locale]})` : label,
  }))
  return CLAUDE_MODEL_OPTIONS.some((option) => option.id === selected)
    ? choices
    : [...choices, { id: selected, label: `${selected} (${SAVED_MARK[locale]})` }]
}

export const claudeEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"])
export type ClaudeEffort = z.infer<typeof claudeEffortSchema>

export const DEFAULT_CLAUDE_EFFORT: ClaudeEffort = "medium"

export const CLAUDE_EFFORT_OPTIONS: ReadonlyArray<{
  id: ClaudeEffort
  label: Readonly<Record<Locale, string>>
}> = [
  { id: "low", label: { ko: "낮음 (빠름)", en: "Low (fast)" } },
  { id: "medium", label: { ko: "보통 (기본)", en: "Medium (default)" } },
  { id: "high", label: { ko: "높음", en: "High" } },
  { id: "xhigh", label: { ko: "매우 높음", en: "Very high" } },
  { id: "max", label: { ko: "최대", en: "Max" } },
]

export function isClaudeEffort(value: string): value is ClaudeEffort {
  return claudeEffortSchema.safeParse(value).success
}

/** Haiku 4.x rejects the effort parameter, so the CLI flag is omitted for it; Haiku 5.5 takes it. */
export function claudeModelSupportsEffort(model: string): boolean {
  return !model.startsWith("claude-haiku-4")
}

/** Haiku 4.x has a 200K-token context window; Haiku 5.5 and the other listed models take 1M. */
export function claudeModelHasLargeContext(model: string): boolean {
  return !model.startsWith("claude-haiku-4")
}

/** Output of `claude auth status --json`; unknown fields are ignored. */
export const claudeCliAuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  subscriptionType: z.string().nullable().optional(),
})

export const claudeAccountStatusSchema = z.object({
  available: z.boolean(),
  authenticated: z.boolean(),
  email: z.string().nullable(),
  subscriptionType: z.string().nullable(),
  loginPending: z.boolean(),
  loginUrl: z.string().url().nullable(),
  error: z.string().optional(),
})
export type ClaudeAccountStatus = z.infer<typeof claudeAccountStatusSchema>
