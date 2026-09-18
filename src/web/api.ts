import { z } from "zod"
import { type AiRequest, aiResultSchema } from "../shared/aiIpc"
import { type ParsedDocumentPage, parsedDocumentPageSchema } from "../shared/documentPageModel"
import {
  type CitationLookupRequest,
  type CitationLookupResult,
  citationLookupResultSchema,
} from "../shared/ipc"
import {
  type HostedCredentialSave,
  type HostedCredentialStatus,
  hostedCredentialStatusSchema,
} from "../shared/webCredentials"
import {
  webDocumentListSchema,
  webDocumentSchema,
  webPageTranslationSchema,
} from "../worker/schemas"

const uploadResponseSchema = z.object({
  document: webDocumentSchema,
  duplicate: z.boolean(),
})

export type WebDocument = z.infer<typeof webDocumentSchema>
export type WebPageTranslation = z.infer<typeof webPageTranslationSchema>
export type WebAiResult = z.infer<typeof aiResultSchema>

export class WebApiError extends Error {
  readonly name = "WebApiError"

  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

async function responseJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json()
  if (response.ok) return value
  const parsed = z.object({ error: z.string() }).safeParse(value)
  throw new WebApiError(response.status, parsed.success ? parsed.data.error : "request_failed")
}

export async function fetchDocuments(): Promise<readonly WebDocument[]> {
  const response = await fetch("/api/documents", { credentials: "include" })
  return webDocumentListSchema.parse(await responseJson(response)).documents
}

export async function uploadPdf(file: File): Promise<WebDocument> {
  const response = await fetch("/api/documents", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/pdf",
      "x-document-name": encodeURIComponent(file.name),
    },
    body: file,
  })
  return uploadResponseSchema.parse(await responseJson(response)).document
}

export async function translateDocumentPage(
  documentId: string,
  pageNumber: number,
  regenerate = false,
): Promise<WebPageTranslation> {
  const suffix = regenerate ? "?regenerate=1" : ""
  const response = await fetch(
    `/api/documents/${documentId}/pages/${pageNumber}/translate${suffix}`,
    {
      method: "POST",
      credentials: "include",
    },
  )
  return webPageTranslationSchema.parse(await responseJson(response))
}

export async function fetchDocumentBytes(documentId: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(documentFileUrl(documentId), { credentials: "include" })
  if (!response.ok) throw new WebApiError(response.status, "document_read_failed")
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]
  if (contentType !== "application/pdf") throw new WebApiError(502, "invalid_document_response")
  return new Uint8Array(await response.arrayBuffer())
}

export async function fetchDocumentPage(
  documentId: string,
  pageNumber: number,
): Promise<ParsedDocumentPage> {
  const response = await fetch(`/api/documents/${documentId}/pages/${pageNumber}`, {
    credentials: "include",
  })
  return parsedDocumentPageSchema.parse(await responseJson(response))
}

export async function runDocumentAi(documentId: string, request: AiRequest): Promise<WebAiResult> {
  const response = await fetch(`/api/documents/${documentId}/ai`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  })
  return aiResultSchema.parse(await responseJson(response))
}

export async function lookupWebCitation(
  documentId: string,
  request: CitationLookupRequest,
): Promise<CitationLookupResult> {
  const response = await fetch(`/api/documents/${documentId}/citations/lookup`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  })
  return citationLookupResultSchema.parse(await responseJson(response))
}

export async function fetchHostedCredentialStatus(): Promise<HostedCredentialStatus> {
  const response = await fetch("/api/credentials", { credentials: "include" })
  return hostedCredentialStatusSchema.parse(await responseJson(response))
}

export async function saveHostedCredential(
  credential: HostedCredentialSave,
): Promise<HostedCredentialStatus> {
  const response = await fetch(`/api/credentials/${credential.provider}`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credential),
  })
  return hostedCredentialStatusSchema.parse(await responseJson(response))
}

export function documentFileUrl(documentId: string): string {
  return `/api/documents/${documentId}/file`
}
