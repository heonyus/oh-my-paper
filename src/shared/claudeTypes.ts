import { z } from "zod"

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5"

export const CLAUDE_MODEL_OPTIONS = [
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (기본)" },
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
] as const

export const claudeEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"])
export type ClaudeEffort = z.infer<typeof claudeEffortSchema>

export const DEFAULT_CLAUDE_EFFORT: ClaudeEffort = "medium"

export const CLAUDE_EFFORT_OPTIONS: ReadonlyArray<{ id: ClaudeEffort; label: string }> = [
  { id: "low", label: "낮음 (빠름)" },
  { id: "medium", label: "보통 (기본)" },
  { id: "high", label: "높음" },
  { id: "xhigh", label: "매우 높음" },
  { id: "max", label: "최대" },
]

export function isClaudeEffort(value: string): value is ClaudeEffort {
  return claudeEffortSchema.safeParse(value).success
}

/** Haiku 4.5 rejects the effort parameter, so the CLI flag is omitted for it. */
export function claudeModelSupportsEffort(model: string): boolean {
  return !model.startsWith("claude-haiku")
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
