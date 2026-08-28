export const OPENROUTER_MODEL_OPTIONS = [
  "z-ai/glm-5.3-flash",
  "deepseek/deepseek-v4-flash-0731",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
] as const

export type OpenRouterModel = (typeof OPENROUTER_MODEL_OPTIONS)[number]

export const DEFAULT_OPENROUTER_MODEL = OPENROUTER_MODEL_OPTIONS[0]

export function isOpenRouterModel(value: string): value is OpenRouterModel {
  return OPENROUTER_MODEL_OPTIONS.some((model) => model === value)
}
