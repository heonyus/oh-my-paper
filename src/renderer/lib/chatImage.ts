import { type Locale, translator } from "../../shared/i18n/locale"
import { readerMessages } from "../messages/reader"

export type ChatImage = { readonly dataUrl: string; readonly name: string }

/** Long edge sent to vision models; larger photos only add upload time. */
const MAX_EDGE = 1_600
const MAX_FILE_BYTES = 20 * 1024 * 1024
/** Stays under the 8,000,000-character `imageDataUrl` bound of the AI request schema. */
const MAX_DATA_URL_CHARACTERS = 7_500_000

export class ChatImageError extends Error {
  readonly name = "ChatImageError"
}

export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Reads a picked, pasted or dropped image into a data URL the AI request accepts.
 * PNG stays PNG so screenshots of equations and tables keep crisp text.
 */
export async function chatImageFromFile(file: File, locale: Locale = "ko"): Promise<ChatImage> {
  const t = translator(readerMessages, locale)
  if (!file.type.startsWith("image/")) throw new ChatImageError(t("image.notImage"))
  if (file.size > MAX_FILE_BYTES) throw new ChatImageError(t("image.tooLargeFile"))
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ChatImageError(t("image.unreadable"))
  })
  try {
    const size = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement("canvas")
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext("2d")
    if (!context) throw new ChatImageError(t("image.processFailed"))
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const png = file.type === "image/png" ? canvas.toDataURL("image/png") : ""
    const dataUrl =
      png && png.length <= MAX_DATA_URL_CHARACTERS ? png : canvas.toDataURL("image/jpeg", 0.9)
    if (dataUrl.length > MAX_DATA_URL_CHARACTERS) throw new ChatImageError(t("image.tooLarge"))
    return { dataUrl, name: file.name || t("image.pastedName") }
  } finally {
    bitmap.close()
  }
}
