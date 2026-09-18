import { ZodError } from "zod"
import { createAuth, sessionUser } from "./auth"
import { lookupDocumentCitation } from "./citation"
import { completeDocumentRequest } from "./completion"
import { credentialResponse } from "./credentials"
import { documentFile, documentPage, listDocuments, uploadDocument } from "./documents"
import { errorResponse, HttpError, routeSegments } from "./http"
import { consumeOcrQueue } from "./ocr"
import { type OcrJob, webDocumentIdSchema } from "./schemas"
import { translatePage } from "./translation"

async function apiResponse(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  const segments = routeSegments(request)
  if (segments[0] !== "api") throw new HttpError(404, "not_found")
  if (segments[1] === "auth") return createAuth(request, env, context).handler(request)
  const user = await sessionUser(request, env, context)
  if (!user) throw new HttpError(401, "authentication_required")
  if (segments[1] === "credentials" && segments.length <= 3)
    return credentialResponse(request, env, user.id, segments[2])
  if (segments.length === 2 && segments[1] === "documents") {
    if (request.method === "GET") return listDocuments(env, user)
    if (request.method === "POST") return uploadDocument(request, env, user)
  }
  const documentId = webDocumentIdSchema.safeParse(segments[2])
  if (segments[1] !== "documents" || !documentId.success) throw new HttpError(404, "not_found")
  if (request.method === "POST" && segments.length === 4 && segments[3] === "ai")
    return completeDocumentRequest(request, env, user.id, documentId.data)
  if (
    request.method === "POST" &&
    segments.length === 5 &&
    segments[3] === "citations" &&
    segments[4] === "lookup"
  )
    return lookupDocumentCitation(request, env, user.id, documentId.data)
  if (request.method === "GET" && segments.length === 4 && segments[3] === "file")
    return documentFile(env, user.id, documentId.data)
  const page = segments[4]
  if (segments[3] === "pages" && page && segments.length === 5 && request.method === "GET")
    return documentPage(env, user.id, documentId.data, page)
  if (
    segments[3] === "pages" &&
    page &&
    segments[5] === "translate" &&
    segments.length === 6 &&
    request.method === "POST"
  )
    return translatePage(request, env, user.id, documentId.data, page)
  throw new HttpError(404, "not_found")
}

export default {
  async fetch(request, env, context): Promise<Response> {
    try {
      const url = new URL(request.url)
      return url.pathname.startsWith("/api/")
        ? await apiResponse(request, env, context)
        : env.ASSETS.fetch(request)
    } catch (error) {
      if (error instanceof ZodError) return errorResponse(new HttpError(400, "invalid_request"))
      return errorResponse(error)
    }
  },
  async queue(batch, env): Promise<void> {
    await consumeOcrQueue(batch.messages, env)
  },
} satisfies ExportedHandler<Env, OcrJob>
