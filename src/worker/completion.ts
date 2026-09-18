import { z } from "zod"
import { completionLimitParameters } from "../electron/aiCompletion"
import { systemPromptFor, userInputFor } from "../electron/aiPrompts"
import { aiRequestSchema, aiResultSchema } from "../shared/aiIpc"
import { findOwnedDocument } from "./documentStore"
import { HttpError, json } from "./http"
import type { WebDocumentId } from "./schemas"
import { resolveUserCredential, selectedTextCredential } from "./userCredentials"

const completionSchema = z.object({
  model: z.string().min(1).optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1),
})

export async function completeDocumentRequest(
  request: Request,
  env: Env,
  userId: string,
  documentId: WebDocumentId,
): Promise<Response> {
  const document = await findOwnedDocument(env.DB, userId, documentId)
  if (!document) throw new HttpError(404, "document_not_found")
  const input = aiRequestSchema.parse(await request.json())
  if (input.documentId !== document.source_hash.slice(0, 16))
    throw new HttpError(400, "document_identity_mismatch")
  const credential = input.imageDataUrl
    ? await resolveUserCredential(env, userId, "gemini")
    : await selectedTextCredential(env, userId)
  if (!credential || credential.provider === "mistral")
    throw new HttpError(409, "provider_key_required")
  const userText = userInputFor(input)
  const userContent = input.imageDataUrl
    ? [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: input.imageDataUrl } },
      ]
    : userText
  const response = await fetch(
    credential.provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: credential.model,
        messages: [
          { role: "system", content: systemPromptFor(input.action) },
          ...(input.history ?? []),
          { role: "user", content: userContent },
        ],
        ...completionLimitParameters(credential.provider, input),
      }),
      signal: AbortSignal.timeout(90_000),
    },
  )
  if (!response.ok) throw new HttpError(502, `gemini_${response.status}`)
  const completion = completionSchema.parse(await response.json())
  const text = completion.choices[0]?.message.content
  if (!text) throw new HttpError(502, "gemini_empty")
  return json(aiResultSchema.parse({ text, model: completion.model ?? credential.model }))
}
