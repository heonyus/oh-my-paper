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

/** One entry of the runtime's `model/list`, reduced to what the pickers show. */
export const codexModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  isDefault: z.boolean(),
  efforts: z.array(z.string().min(1)),
})

export type CodexModel = z.infer<typeof codexModelSchema>

export const codexModelListSchema = z.array(codexModelSchema)

const ALL_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"]

/** Korean hints for models the runtime is known to list; others keep its English text. */
const CODEX_MODEL_HINTS: Readonly<Record<string, string>> = {
  "gpt-6-astra": "최신 · 가장 깊은 추론과 리서치",
  "gpt-6-sol": "최신 · 복잡한 작업",
  "gpt-6-luna": "최신 · 빠르고 가벼움",
  "gpt-5.6-sol": "이전 세대 · 복잡한 작업",
  "gpt-5.6-terra": "이전 세대 · 균형",
  "gpt-5.6-luna": "이전 세대 · 빠르고 가벼움",
  "gpt-5.5": "레거시",
}

export const CODEX_DEFAULT_MODEL = "gpt-6-astra"

/** Shown until the bundled runtime answers `model/list` (offline or an older runtime). */
export const CODEX_MODEL_OPTIONS: readonly CodexModel[] = [
  { id: "gpt-6-astra", label: "GPT-6 Astra", efforts: ALL_EFFORTS },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", efforts: ALL_EFFORTS },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", efforts: ALL_EFFORTS },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", efforts: ALL_EFFORTS.slice(0, 5) },
  { id: "gpt-5.5", label: "GPT-5.5", efforts: ALL_EFFORTS.slice(0, 4) },
].map((model) => ({
  ...model,
  description: CODEX_MODEL_HINTS[model.id] ?? "",
  isDefault: model.id === CODEX_DEFAULT_MODEL,
}))

/** Maps one raw `model/list` entry; the runtime's display names use hyphens (`GPT-6-Astra`). */
export function codexModelFromRuntime(raw: {
  readonly id: string
  readonly displayName?: string | undefined
  readonly description?: string | undefined
  readonly isDefault?: boolean | undefined
  readonly supportedReasoningEfforts?:
    | ReadonlyArray<{ readonly reasoningEffort: string }>
    | undefined
}): CodexModel {
  const label = (raw.displayName ?? raw.id).replace(/^(GPT-[\d.]+)-/i, "$1 ")
  return {
    id: raw.id,
    label,
    description: CODEX_MODEL_HINTS[raw.id] ?? raw.description ?? "",
    isDefault: raw.isDefault ?? false,
    efforts: (raw.supportedReasoningEfforts ?? []).map((option) => option.reasoningEffort),
  }
}

/** The runtime's default model, falling back to the app default. */
export function defaultCodexModel(models: readonly CodexModel[]): string {
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? CODEX_DEFAULT_MODEL
}

/** The model choices, keeping a saved model that is no longer listed so the select shows it. */
export function codexModelChoices(
  models: readonly CodexModel[],
  selected: string,
): readonly CodexModel[] {
  return models.some((model) => model.id === selected)
    ? models
    : [
        ...models,
        {
          id: selected,
          label: selected,
          description: "저장된 모델",
          isDefault: false,
          efforts: [],
        },
      ]
}

export const CODEX_REASONING_EFFORT_OPTIONS = [
  { id: "low", label: "low (낮음)" },
  { id: "medium", label: "medium (중간 · 기본)" },
  { id: "high", label: "high (높음)" },
  { id: "xhigh", label: "xhigh (매우 높음)" },
  { id: "max", label: "max (최대)" },
  { id: "ultra", label: "ultra (울트라)" },
] as const

/** The efforts a model supports; an unknown model offers the four every model accepts. */
export function codexReasoningEffortOptions(
  model: string,
  models: readonly CodexModel[] = CODEX_MODEL_OPTIONS,
): readonly (typeof CODEX_REASONING_EFFORT_OPTIONS)[number][] {
  const supported = models.find((option) => option.id === model)?.efforts
  const allowed = supported && supported.length > 0 ? supported : ALL_EFFORTS.slice(0, 4)
  return CODEX_REASONING_EFFORT_OPTIONS.filter((option) => allowed.includes(option.id))
}
