import { z } from "zod"

export const hostedCredentialProviderSchema = z.enum(["gemini", "groq", "mistral"])
export const hostedCredentialSourceSchema = z.enum(["personal", "shared", "missing"])

export const GEMINI_WEB_MODEL = "gemini-3.5-flash-lite"
export const GROQ_WEB_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] as const
export const MISTRAL_WEB_MODEL = "mistral-ocr-4-1"

const apiKeySchema = z.string().trim().min(20).max(512)
const textCredentialSchema = z.object({
  source: hostedCredentialSourceSchema,
  model: z.string().min(1).max(160),
})

export const hostedCredentialStatusSchema = z.object({
  providers: z.object({
    gemini: textCredentialSchema,
    groq: textCredentialSchema,
    mistral: textCredentialSchema,
  }),
  preferredTextProvider: z.enum(["gemini", "groq"]),
})

export const hostedCredentialSaveSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("gemini"),
    apiKey: apiKeySchema,
    model: z.string().min(1).max(160).default(GEMINI_WEB_MODEL),
  }),
  z.object({
    provider: z.literal("groq"),
    apiKey: apiKeySchema,
    model: z.enum(GROQ_WEB_MODELS).default(GROQ_WEB_MODELS[0]),
  }),
  z.object({
    provider: z.literal("mistral"),
    apiKey: apiKeySchema,
    model: z.literal(MISTRAL_WEB_MODEL).default(MISTRAL_WEB_MODEL),
  }),
])

export type HostedCredentialProvider = z.infer<typeof hostedCredentialProviderSchema>
export type HostedCredentialStatus = z.infer<typeof hostedCredentialStatusSchema>
export type HostedCredentialSave = z.infer<typeof hostedCredentialSaveSchema>
