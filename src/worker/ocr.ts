import { parsedPagesFromMistralResponse } from "../electron/mistralOcrResponse"
import { parsedPageKey, setDocumentStatus } from "./documentStore"
import { type OcrJob, ocrJobSchema } from "./schemas"
import { maximumWebPdfBytes } from "./upload"
import { resolveUserCredential } from "./userCredentials"

function base64(bytes: Uint8Array): string {
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}

async function mistralOcr(apiKey: string, model: string, bytes: Uint8Array): Promise<unknown> {
  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      document: {
        type: "document_url",
        document_url: `data:application/pdf;base64,${base64(bytes)}`,
      },
      include_blocks: true,
      include_image_base64: false,
      confidence_scores_granularity: "block",
      extract_header: true,
      extract_footer: true,
      table_format: "markdown",
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!response.ok) throw new Error(`mistral_ocr_${response.status}`)
  return response.json()
}

export async function processOcrJob(env: Env, value: unknown): Promise<void> {
  const job = ocrJobSchema.parse(value)
  await setDocumentStatus(env.DB, job.documentId, "analyzing")
  try {
    const object = await env.DOCUMENTS.get(job.objectKey)
    if (!object || object.size > maximumWebPdfBytes) throw new Error("pdf_unavailable")
    const credential = await resolveUserCredential(env, job.userId, "mistral")
    if (!credential) throw new Error("mistral_key_missing")
    const pages = parsedPagesFromMistralResponse(
      await mistralOcr(
        credential.apiKey,
        credential.model,
        new Uint8Array(await object.arrayBuffer()),
      ),
      job.sourceHash,
    )
    if (pages.length === 0) throw new Error("empty_ocr")
    await Promise.all(
      pages.map((page) =>
        env.DOCUMENTS.put(parsedPageKey(job.objectKey, page.pageNumber), JSON.stringify(page), {
          httpMetadata: { contentType: "application/json" },
        }),
      ),
    )
    await setDocumentStatus(env.DB, job.documentId, "ready", pages.length)
  } catch (error) {
    await setDocumentStatus(env.DB, job.documentId, "failed", 0, "ocr_failed")
    throw error
  }
}

export async function consumeOcrQueue(
  messages: readonly Message<OcrJob>[],
  env: Env,
): Promise<void> {
  await Promise.all(
    messages.map(async (message) => {
      const job = ocrJobSchema.safeParse(message.body)
      if (!job.success) {
        message.ack()
        return
      }
      try {
        await processOcrJob(env, job.data)
        message.ack()
      } catch {
        message.retry()
      }
    }),
  )
}
