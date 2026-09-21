import { z } from "zod"

export const MISTRAL_OCR_MODEL = "mistral-ocr-4-1"

export const documentOcrProviderStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("mistral"),
  model: z.enum(["mistral-ocr-latest", "mistral-ocr-4-1"]),
})

export const documentOcrKeySchema = z.string().trim().min(20).max(512)

export type DocumentOcrProviderStatus = z.infer<typeof documentOcrProviderStatusSchema>
