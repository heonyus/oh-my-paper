import { z } from "zod"
import type { Locale } from "./i18n/locale"

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

/**
 * Short hints for models the runtime is known to list; others keep its English text. A model's
 * `description` carries the Korean one; `codexModelHint` gives it in the reader's language.
 */
const CODEX_MODEL_HINTS: Readonly<Record<string, Readonly<Record<Locale, string>>>> = {
  "gpt-6.1-sol": { ko: "최신 · 복잡한 작업", en: "Latest · complex tasks" },
  "gpt-6-astra": {
    ko: "최신 · 가장 깊은 추론과 리서치",
    en: "Latest · deepest reasoning and research",
  },
  "gpt-6-sol": { ko: "최신 · 복잡한 작업", en: "Latest · complex tasks" },
  "gpt-6-luna": { ko: "최신 · 빠르고 가벼움", en: "Latest · fast and light" },
  "gpt-5.6-sol": { ko: "이전 세대 · 복잡한 작업", en: "Previous generation · complex tasks" },
  "gpt-5.6-terra": { ko: "이전 세대 · 균형", en: "Previous generation · balanced" },
  "gpt-5.6-luna": { ko: "이전 세대 · 빠르고 가벼움", en: "Previous generation · fast and light" },
  "gpt-5.5": { ko: "레거시", en: "Legacy" },
}

/** The hint for a model the app knows, in `locale`; undefined for any other model. */
export function codexModelHint(id: string, locale: Locale): string | undefined {
  return CODEX_MODEL_HINTS[id]?.[locale]
}

/** Fast and light enough for translation and explanations; chosen whenever the account lists it. */
export const CODEX_DEFAULT_MODEL = "gpt-6-luna"

/** Shown until the bundled runtime answers `model/list` (offline or an older runtime). */
export const CODEX_MODEL_OPTIONS: readonly CodexModel[] = [
  { id: "gpt-6-luna", label: "GPT-6 Luna", efforts: ALL_EFFORTS.slice(0, 5) },
  { id: "gpt-6-astra", label: "GPT-6 Astra", efforts: ALL_EFFORTS },
  { id: "gpt-6-sol", label: "GPT-6 Sol", efforts: ALL_EFFORTS },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", efforts: ALL_EFFORTS },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", efforts: ALL_EFFORTS },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", efforts: ALL_EFFORTS.slice(0, 5) },
  { id: "gpt-5.5", label: "GPT-5.5", efforts: ALL_EFFORTS.slice(0, 4) },
].map((model) => ({
  ...model,
  description: codexModelHint(model.id, "ko") ?? "",
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
    description: codexModelHint(raw.id, "ko") ?? raw.description ?? "",
    isDefault: raw.isDefault ?? false,
    efforts: (raw.supportedReasoningEfforts ?? []).map((option) => option.reasoningEffort),
  }
}

/** The app default when the account lists it, else the runtime's default, else the first model. */
export function defaultCodexModel(models: readonly CodexModel[]): string {
  return (
    models.find((model) => model.id === CODEX_DEFAULT_MODEL)?.id ??
    models.find((model) => model.isDefault)?.id ??
    models[0]?.id ??
    CODEX_DEFAULT_MODEL
  )
}

/** The model choices, keeping a saved model that is no longer listed so the select shows it. */
export function codexModelChoices(
  models: readonly CodexModel[],
  selected: string,
  locale: Locale = "ko",
): readonly CodexModel[] {
  return models.some((model) => model.id === selected)
    ? models
    : [
        ...models,
        {
          id: selected,
          label: selected,
          description: locale === "en" ? "Saved model" : "저장된 모델",
          isDefault: false,
          efforts: [],
        },
      ]
}

/** The runtime's effort names: English shows them as they are, Korean adds a gloss. */
export const CODEX_REASONING_EFFORT_OPTIONS = [
  { id: "low", label: { ko: "low (낮음)", en: "low" } },
  { id: "medium", label: { ko: "medium (중간 · 기본)", en: "medium (default)" } },
  { id: "high", label: { ko: "high (높음)", en: "high" } },
  { id: "xhigh", label: { ko: "xhigh (매우 높음)", en: "xhigh" } },
  { id: "max", label: { ko: "max (최대)", en: "max" } },
  { id: "ultra", label: { ko: "ultra (울트라)", en: "ultra" } },
] as const satisfies readonly {
  readonly id: string
  readonly label: Readonly<Record<Locale, string>>
}[]

/** The efforts a model supports; an unknown model offers the four every model accepts. */
export function codexReasoningEffortOptions(
  model: string,
  models: readonly CodexModel[] = CODEX_MODEL_OPTIONS,
): readonly (typeof CODEX_REASONING_EFFORT_OPTIONS)[number][] {
  const supported = models.find((option) => option.id === model)?.efforts
  const allowed = supported && supported.length > 0 ? supported : ALL_EFFORTS.slice(0, 4)
  return CODEX_REASONING_EFFORT_OPTIONS.filter((option) => allowed.includes(option.id))
}
