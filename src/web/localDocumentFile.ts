import { z } from "zod"
import type { DocumentId } from "../shared/schemas"
import { LocalApiError } from "./localTransport"

const DOCUMENT_READ_TIMEOUT_MS = 60_000
const failureSchema = z.object({ error: z.string().max(500) })

async function failureCode(response: Response): Promise<string> {
  try {
    const failure = failureSchema.safeParse(await response.json())
    return failure.success ? failure.data.error : "document_read_failed"
  } catch {
    return "document_read_failed"
  }
}

/** Downloads a stored PDF from the loopback server as raw bytes. */
export async function fetchLocalDocumentBytes(
  id: DocumentId,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const controller = new AbortController()
  const forwardAbort = (): void => controller.abort(signal?.reason)
  if (signal?.aborted) forwardAbort()
  signal?.addEventListener("abort", forwardAbort, { once: true })
  const timer = setTimeout(
    () => controller.abort(new DOMException("document_read_timeout", "TimeoutError")),
    DOCUMENT_READ_TIMEOUT_MS,
  )
  try {
    const response = await fetch(`/api/documents/${id}/file`, { signal: controller.signal })
    if (!response.ok) throw new LocalApiError(response.status, await failureCode(response))
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]
    if (contentType !== "application/pdf") throw new LocalApiError(502, "invalid_document_response")
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0) throw new LocalApiError(502, "empty_document")
    return bytes
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", forwardAbort)
  }
}
