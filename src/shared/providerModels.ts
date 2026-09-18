import { z } from "zod"

export const providerKindSchema = z.enum(["openai", "openrouter", "opencodex", "gemini", "groq"])

export const aiModeSchema = z.enum(["api", "chatgpt"])
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
  "google/gemini-2.5-flash-lite",
  "z-ai/glm-5.3-flash",
  "deepseek/deepseek-v4-flash-0731",
  "anthropic/claude-3.7-sonnet",
  "google/gemini-2.5-flash",
  "openai/gpt-4.1",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
] as const

export const GROQ_MODEL_OPTIONS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
] as const

export const OPENCODEX_MODEL_OPTIONS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "cursor/gemini-3.8-flash",
] as const

export type OpenRouterModel = (typeof OPENROUTER_MODEL_OPTIONS)[number]

export const DEFAULT_OPENROUTER_MODEL = OPENROUTER_MODEL_OPTIONS[0]

export function isOpenRouterModel(value: string): value is OpenRouterModel {
  return OPENROUTER_MODEL_OPTIONS.some((model) => model === value)
}
