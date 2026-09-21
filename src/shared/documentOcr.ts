import { z } from "zod"

export const documentOcrProviderStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("paddle"),
  model: z.literal("PaddleOCR-VL-1.6"),
})

export type DocumentOcrProviderStatus = z.infer<typeof documentOcrProviderStatusSchema>
