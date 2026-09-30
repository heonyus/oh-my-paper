import { z } from "zod"
import type { Locale } from "./i18n/locale"

export const MISTRAL_OCR_MODEL = "mistral-ocr-4-1"
export const documentOcrKeySchema = z.string().trim().min(20).max(512)

export const documentOcrProviderStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("paddle"),
  model: z.literal("PaddleOCR-VL-1.6"),
  /** GPU server that recognizes text: vLLM in WSL on Windows, MLX on Apple silicon. */
  acceleration: z.enum(["vllm", "mlx"]).nullable().default(null),
  /** A background setup is still downloading or installing the runtime. */
  installing: z.boolean().optional(),
  /** How far that setup is, when it has reported progress. */
  installProgress: z
    .object({
      percent: z.number().min(0).max(100),
      etaSeconds: z.number().nonnegative().nullable(),
    })
    .optional(),
})

export type DocumentOcrProviderStatus = z.infer<typeof documentOcrProviderStatusSchema>

/** `42% · 약 3분 남음`, the same words in doctor, 설정 and the first-run page. */
export function formatOcrInstallProgress(
  progress: DocumentOcrProviderStatus["installProgress"] | null,
  locale: Locale = "ko",
): string {
  const en = locale === "en"
  if (!progress) return en ? "getting ready" : "준비 중"
  const { percent, etaSeconds } = progress
  if (etaSeconds === null) return `${percent}%`
  const minutes = Math.ceil(etaSeconds / 60)
  const left =
    etaSeconds < 60
      ? en
        ? "under a minute left"
        : "1분 안에 끝남"
      : en
        ? `about ${minutes} min left`
        : `약 ${minutes}분 남음`
  return `${percent}% · ${left}`
}
