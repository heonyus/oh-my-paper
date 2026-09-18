import { z } from "zod"
import { parsedDocumentPageSchema } from "../shared/documentPageModel"
import {
  geminiPageTranslationResponseFormat,
  pageTranslationResponseSchema,
} from "../shared/pageTranslationProtocol"
import {
  pageTranslationBlocksFromParsedPage,
  planParsedPageTranslations,
} from "../shared/parsedPageTranslation"
import { findOwnedDocument, parsedPageKey } from "./documentStore"
import { HttpError, json, pageNumberSchema } from "./http"
import { type WebDocumentId, type WebPageTranslation, webPageTranslationSchema } from "./schemas"
import { type ResolvedCredential, resolveUserCredential } from "./userCredentials"

const geminiResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1),
})

const cachedRowSchema = z.object({ content_json: z.string().min(1) })

async function cachedTranslation(
  env: Env,
  userId: string,
  documentId: WebDocumentId,
  pageNumber: number,
  model: string,
): Promise<WebPageTranslation | null> {
  const row = await env.DB.prepare(
    `SELECT content_json FROM translations
     WHERE document_id = ? AND user_id = ? AND page_number = ? AND model = ?`,
  )
    .bind(documentId, userId, pageNumber, model)
    .first()
  if (!row) return null
  const parsed = webPageTranslationSchema.parse(JSON.parse(cachedRowSchema.parse(row).content_json))
  return { ...parsed, cached: true }
}

async function requestGemini(
  credential: ResolvedCredential,
  blocks: readonly { readonly id: string; readonly kind: string; readonly source: string }[],
): Promise<ReadonlyMap<string, string>> {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: credential.model,
        messages: [
          {
            role: "system",
            content:
              "Translate English academic prose into natural Korean. Return every ID exactly once and in order. Preserve citations, URLs, symbols, and LaTeX exactly. Do not summarize or add commentary.",
          },
          { role: "user", content: JSON.stringify({ blocks }) },
        ],
        max_completion_tokens: 8_192,
        reasoning_effort: "minimal",
        temperature: 0,
        response_format: geminiPageTranslationResponseFormat,
      }),
      signal: AbortSignal.timeout(90_000),
    },
  )
  if (!response.ok) throw new HttpError(502, `gemini_${response.status}`)
  const completion = geminiResponseSchema.parse(await response.json())
  const content = completion.choices[0]?.message.content
  if (!content) throw new HttpError(502, "gemini_empty")
  const output = pageTranslationResponseSchema.parse(JSON.parse(content))
  const expected = blocks.map((block) => block.id)
  if (
    output.translations.length !== expected.length ||
    output.translations.some((item, index) => item.id !== expected[index])
  )
    throw new HttpError(502, "gemini_mapping_mismatch")
  return new Map(output.translations.map((item) => [item.id, item.markdown]))
}

async function translatedPage(
  env: Env,
  userId: string,
  documentId: WebDocumentId,
  pageNumber: number,
  credential: ResolvedCredential,
): Promise<WebPageTranslation> {
  const document = await findOwnedDocument(env.DB, userId, documentId)
  if (!document) throw new HttpError(404, "document_not_found")
  if (document.status !== "ready") throw new HttpError(409, "document_not_ready")
  const object = await env.DOCUMENTS.get(parsedPageKey(document.object_key, pageNumber))
  if (!object) throw new HttpError(404, "page_not_found")
  const page = parsedDocumentPageSchema.parse(await object.json())
  const blocks = pageTranslationBlocksFromParsedPage(page)
  const plan = planParsedPageTranslations(blocks)
  const translated =
    plan.translatable.length > 0
      ? await requestGemini(
          credential,
          plan.translatable.map(({ id, kind, source }) => ({ id, kind, source })),
        )
      : new Map<string, string>()
  const payload = webPageTranslationSchema.parse({
    documentId,
    pageNumber,
    pageWidth: page.width,
    pageHeight: page.height,
    cached: false,
    items: plan.initial.map((block) => ({
      id: block.id,
      source: block.source,
      translation: block.translation || translated.get(block.id) || "",
      kind: block.structureKind,
      bounds: block.sourceBounds,
    })),
  })
  await env.DB.prepare(
    `INSERT OR REPLACE INTO translations
     (document_id, user_id, page_number, model, content_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      documentId,
      userId,
      pageNumber,
      credential.model,
      JSON.stringify(payload),
      new Date().toISOString(),
    )
    .run()
  return payload
}

export async function translatePage(
  request: Request,
  env: Env,
  userId: string,
  documentId: WebDocumentId,
  pageValue: string,
): Promise<Response> {
  const pageNumber = pageNumberSchema.parse(pageValue)
  const regenerate = new URL(request.url).searchParams.get("regenerate") === "1"
  const credential = await resolveUserCredential(env, userId, "gemini")
  if (!credential) throw new HttpError(409, "gemini_key_required")
  const cached = regenerate
    ? null
    : await cachedTranslation(env, userId, documentId, pageNumber, credential.model)
  return json(cached ?? (await translatedPage(env, userId, documentId, pageNumber, credential)))
}
