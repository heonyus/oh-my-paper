import { z } from "zod"

export const codexKnownPlanTypeSchema = z.enum([
  "free",
  "go",
  "plus",
  "pro",
  "prolite",
  "team",
  "self_serve_business_prolite",
  "self_serve_business_usage_based",
  "business",
  "ent26",
  "enterprise_cbp_automation",
  "enterprise_cbp_usage_based",
  "enterprise",
  "edu",
  "edu_plus",
  "edu_pro",
  "unknown",
])

export const codexPlanTypeSchema = z.union([codexKnownPlanTypeSchema, z.string().min(1)])

export type CodexPlanType = z.infer<typeof codexPlanTypeSchema>

export const codexAccountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("apiKey"),
  }),
  z.object({
    type: z.literal("chatgpt"),
    email: z.string().nullable().optional(),
    planType: codexPlanTypeSchema,
  }),
  z.object({
    type: z.literal("amazonBedrock"),
    usesCodexManagedCredentials: z.boolean().optional(),
  }),
])

export type CodexAccount = z.infer<typeof codexAccountSchema>

export const codexRateLimitWindowSchema = z.object({
  usedPercent: z.number().int().min(0).max(100),
  resetsAt: z.number().int().nullable().optional(),
  windowDurationMins: z.number().int().nullable().optional(),
})

export type CodexRateLimitWindow = z.infer<typeof codexRateLimitWindowSchema>

export const codexRateLimitSnapshotSchema = z.object({
  limitId: z.string().nullable().optional(),
  limitName: z.string().nullable().optional(),
  planType: codexPlanTypeSchema.nullable().optional(),
  primary: codexRateLimitWindowSchema.nullable().optional(),
  secondary: codexRateLimitWindowSchema.nullable().optional(),
  rateLimitReachedType: z.string().nullable().optional(),
  spendControlReached: z.boolean().nullable().optional(),
})

export type CodexRateLimitSnapshot = z.infer<typeof codexRateLimitSnapshotSchema>

export const codexAccountRateLimitsSchema = z.object({
  accountId: z.string().nullable().optional(),
  rateLimits: codexRateLimitSnapshotSchema,
  rateLimitsByLimitId: z.record(z.string(), codexRateLimitSnapshotSchema).nullable().optional(),
})

export type CodexAccountRateLimits = z.infer<typeof codexAccountRateLimitsSchema>

export const codexLoginTypeSchema = z.enum(["chatgpt", "chatgptDeviceCode"])
export type CodexLoginType = z.infer<typeof codexLoginTypeSchema>

export const codexLoginStartResultSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chatgpt"),
    loginId: z.string().min(1),
    authUrl: z.string().url(),
  }),
  z.object({
    type: z.literal("chatgptDeviceCode"),
    loginId: z.string().min(1),
    userCode: z.string().min(1),
    verificationUrl: z.string().url(),
  }),
  z.object({
    type: z.literal("apiKey"),
  }),
  z.object({
    type: z.literal("chatgptAuthTokens"),
  }),
  z.object({
    type: z.literal("amazonBedrock"),
  }),
])

export type CodexLoginStartResult = z.infer<typeof codexLoginStartResultSchema>

export const codexLoginCompletedEventSchema = z.object({
  loginId: z.string().nullable().optional(),
  success: z.boolean(),
  error: z.string().nullable().optional(),
})

export type CodexLoginCompletedEvent = z.infer<typeof codexLoginCompletedEventSchema>

export const codexAccountStatusSchema = z.object({
  available: z.boolean(),
  authenticated: z.boolean(),
  account: codexAccountSchema.nullable(),
  requiresOpenaiAuth: z.boolean(),
  rateLimits: codexAccountRateLimitsSchema.nullable().optional(),
  executablePath: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
})

export type CodexAccountStatus = z.infer<typeof codexAccountStatusSchema>

export const CODEX_MODEL_OPTIONS = [
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol (최고 성능 추론 및 리서치)" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra (균형 잡힌 에이전트 작업)" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna (빠르고 가벼운 속도)" },
  { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark (네이티브 스파크)" },
  { id: "gpt-6-astra", label: "GPT-6 Astra (복합 고급 연구)" },
  { id: "o3", label: "o3 (심층 추론)" },
  { id: "o4-mini", label: "o4-mini (경량 추론)" },
] as const

export const CODEX_REASONING_EFFORT_OPTIONS = [
  { id: "none", label: "none (추론 없음)" },
  { id: "minimal", label: "minimal (최소)" },
  { id: "low", label: "low (낮음)" },
  { id: "medium", label: "medium (중간 · 기본)" },
  { id: "high", label: "high (높음)" },
  { id: "xhigh", label: "xhigh (매우 높음)" },
  { id: "max", label: "max (최대)" },
  { id: "ultra", label: "ultra (울트라)" },
] as const
