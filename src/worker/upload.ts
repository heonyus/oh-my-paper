import { z } from "zod"
import { type Sha256, sha256Schema } from "../shared/schemas"

export const maximumWebPdfBytes = 16 * 1024 * 1024

const uploadNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine((value) => value.toLocaleLowerCase().endsWith(".pdf"))

export class WebUploadError extends Error {
  readonly name = "WebUploadError"

  constructor(readonly code: "invalid_pdf" | "missing_size" | "too_large") {
    super(code)
  }
}

export type PdfUpload = {
  readonly name: string
  readonly hash: Sha256
  readonly bytes: Uint8Array
}

function decodeName(value: string | null): string {
  if (!value) throw new WebUploadError("invalid_pdf")
  try {
    return uploadNameSchema.parse(decodeURIComponent(value))
  } catch (error) {
    if (error instanceof URIError || error instanceof z.ZodError)
      throw new WebUploadError("invalid_pdf")
    throw error
  }
}

function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  )
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function readPdfUpload(request: Request): Promise<PdfUpload> {
  const size = Number(request.headers.get("content-length"))
  if (!Number.isSafeInteger(size) || size <= 0) throw new WebUploadError("missing_size")
  if (size > maximumWebPdfBytes) throw new WebUploadError("too_large")
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/pdf")
    throw new WebUploadError("invalid_pdf")
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength !== size || !isPdf(bytes)) throw new WebUploadError("invalid_pdf")
  const hash = sha256Schema.parse(hex(await crypto.subtle.digest("SHA-256", bytes)))
  return { name: decodeName(request.headers.get("x-document-name")), hash, bytes }
}
