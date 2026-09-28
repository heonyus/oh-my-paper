import { z } from "zod"

export const providerKindSchema = z.enum([
  "openai",
  "openrouter",
  "opencodex",
  "gemini",
  "groq",
  "anthropic",
])

export const aiModeSchema = z.enum(["api", "chatgpt", "claude"])
export type AiMode = z.infer<typeof aiModeSchema>

export const OPENAI_MODEL_OPTIONS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5",
  "o3",
  "o4-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
] as const

export const GEMINI_MODEL_OPTIONS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
] as const

export const OPENROUTER_MODEL_OPTIONS = [
  "z-ai/glm-5.3-flash",
  "google/gemini-2.5-flash-lite",
  "qwen/qwen3.7-flash",
  "qwen/qwen3.8-flash",
  "deepseek/deepseek-v4.1-flash",
  "google/gemini-3.1-flash-lite",
] as const

export const OPENROUTER_PAGE_TRANSLATION_MODEL = "tencent/hy-mt2-30b-a3b" as const

export const PAGE_TRANSLATION_MAIN_MODEL = "main" as const

export const OPENROUTER_PAGE_TRANSLATION_OPTIONS = [
  OPENROUTER_PAGE_TRANSLATION_MODEL,
  "tencent/hy-mt2-7b",
  "tencent/hy-mt2-1.8b",
  "qwen/qwen3-30b-a3b-instruct-2507",
  "upstage/solar-pro4",
  "google/gemini-2.5-flash-lite",
] as const

export function isHyMtModel(model: string): boolean {
  return model.startsWith("tencent/hy-mt")
}

export function isOpenRouterPageTranslationModel(value: string): boolean {
  return (
    value === PAGE_TRANSLATION_MAIN_MODEL ||
    OPENROUTER_PAGE_TRANSLATION_OPTIONS.some((option) => option === value)
  )
}

export const GROQ_MODEL_OPTIONS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
] as const

export type OpenRouterModel = (typeof OPENROUTER_MODEL_OPTIONS)[number]

export const DEFAULT_OPENROUTER_MODEL = OPENROUTER_MODEL_OPTIONS[0]

export function isOpenRouterModel(value: string): value is OpenRouterModel {
  return OPENROUTER_MODEL_OPTIONS.some((model) => model === value)
}
