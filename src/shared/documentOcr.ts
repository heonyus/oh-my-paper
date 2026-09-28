import { z } from "zod"

export const MISTRAL_OCR_MODEL = "mistral-ocr-4-1"
export const documentOcrKeySchema = z.string().trim().min(20).max(512)

export const documentOcrProviderStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("paddle"),
  model: z.literal("PaddleOCR-VL-1.6"),
  /** GPU server that recognizes text: vLLM in WSL on Windows, MLX on Apple silicon. */
  acceleration: z.enum(["vllm", "mlx"]).nullable().default(null),
})

export type DocumentOcrProviderStatus = z.infer<typeof documentOcrProviderStatusSchema>
