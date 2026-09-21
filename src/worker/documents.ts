import {
  findOwnedDocument,
  findOwnedDocumentByHash,
  insertDocument,
  listOwnedDocuments,
  newWebDocumentId,
  parsedPageKey,
  setDocumentStatus,
} from "./documentStore"
import { HttpError, json, pageNumberSchema } from "./http"
import { publicDocument, type WebDocumentId } from "./schemas"
import { readPdfUpload, WebUploadError } from "./upload"

type User = { readonly id: string; readonly name: string }

export async function listDocuments(env: Env, user: User): Promise<Response> {
  const documents = await listOwnedDocuments(env.DB, user.id)
  return json({ documents: documents.map(publicDocument), user: { name: user.name } })
}

export async function uploadDocument(request: Request, env: Env, user: User): Promise<Response> {
  try {
    const upload = await readPdfUpload(request)
    const existing = await findOwnedDocumentByHash(env.DB, user.id, upload.hash)
    if (existing) {
      return json({ document: publicDocument(existing), duplicate: true })
    }
    const id = newWebDocumentId()
    const objectKey = `users/${user.id}/documents/${id}/source.pdf`
    await env.DOCUMENTS.put(objectKey, upload.bytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { owner: user.id, sourceHash: upload.hash },
    })
    // ponytail: a simultaneous duplicate upload can leave one orphaned object; add an
    // idempotency key and cleanup job if real multi-tab traffic makes that observable.
    const row = await insertDocument(env.DB, {
      id,
      userId: user.id,
      name: upload.name,
      sourceHash: upload.hash,
      objectKey,
    })
    await setDocumentStatus(env.DB, id, "failed", 0, "local_ocr_required")
    return json(
      {
        document: publicDocument({ ...row, status: "failed", error_code: "local_ocr_required" }),
        duplicate: false,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof WebUploadError) throw new HttpError(400, error.code)
    throw error
  }
}

async function owned(env: Env, userId: string, id: WebDocumentId) {
  const document = await findOwnedDocument(env.DB, userId, id)
  if (!document) throw new HttpError(404, "document_not_found")
  return document
}

export async function documentFile(
  env: Env,
  userId: string,
  documentId: WebDocumentId,
): Promise<Response> {
  const document = await owned(env, userId, documentId)
  const object = await env.DOCUMENTS.get(document.object_key)
  if (!object) throw new HttpError(404, "document_file_not_found")
  const headers = new Headers({
    "cache-control": "private, max-age=3600",
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    "content-type": object.httpMetadata?.contentType ?? "application/pdf",
    etag: object.httpEtag,
  })
  return new Response(object.body, { headers })
}

export async function documentPage(
  env: Env,
  userId: string,
  documentId: WebDocumentId,
  pageValue: string,
): Promise<Response> {
  const pageNumber = pageNumberSchema.parse(pageValue)
  const document = await owned(env, userId, documentId)
  if (document.status !== "ready") throw new HttpError(409, "document_not_ready")
  const page = await env.DOCUMENTS.get(parsedPageKey(document.object_key, pageNumber))
  if (!page) throw new HttpError(404, "page_not_found")
  return new Response(page.body, {
    headers: { "cache-control": "private, max-age=3600", "content-type": "application/json" },
  })
}
