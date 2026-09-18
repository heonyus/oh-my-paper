import type { ParsedDocumentPage } from "../../shared/documentPageModel"
import type { DocumentId } from "../../shared/schemas"

const pagesByDocument = new Map<DocumentId, Map<number, ParsedDocumentPage>>()
const activeRequests = new Map<string, Promise<ParsedDocumentPage | null>>()
const listeners = new Map<DocumentId, Set<(page: ParsedDocumentPage) => void>>()
const generations = new Map<DocumentId, number>()
const pageGenerations = new Map<string, number>()
let activeDocumentId: DocumentId | null = null

function requestKey(documentId: DocumentId, pageNumber: number): string {
  return `${documentId}:${pageNumber}`
}

function storePage(documentId: DocumentId, page: ParsedDocumentPage): void {
  const pages = pagesByDocument.get(documentId) ?? new Map<number, ParsedDocumentPage>()
  pages.set(page.pageNumber, page)
  pagesByDocument.set(documentId, pages)
  for (const listener of listeners.get(documentId) ?? []) listener(page)
}

export function parsedDocumentPage(
  documentId: DocumentId,
  pageNumber: number,
): ParsedDocumentPage | null {
  return pagesByDocument.get(documentId)?.get(pageNumber) ?? null
}

export function parsedDocumentPages(documentId: DocumentId): readonly ParsedDocumentPage[] {
  return [...(pagesByDocument.get(documentId)?.values() ?? [])].sort(
    (left, right) => left.pageNumber - right.pageNumber,
  )
}

export function loadParsedDocumentPage(
  documentId: DocumentId,
  pageNumber: number,
  options: { readonly forceOcr?: boolean } = {},
): Promise<ParsedDocumentPage | null> {
  if (options.forceOcr) invalidateParsedDocumentPage(documentId, pageNumber)
  const cached = parsedDocumentPage(documentId, pageNumber)
  if (cached) return Promise.resolve(cached)
  const key = requestKey(documentId, pageNumber)
  const generation = generations.get(documentId) ?? 0
  const pageGeneration = pageGenerations.get(key) ?? 0
  const active = activeRequests.get(key)
  if (active) return active
  const operation = window.scourgify
    .parseDocumentPage({
      id: documentId,
      pageNumber,
      ...(options.forceOcr ? { forceOcr: true } : {}),
    })
    .then((result) => {
      if (
        result.status !== "ready" ||
        (generations.get(documentId) ?? 0) !== generation ||
        (pageGenerations.get(key) ?? 0) !== pageGeneration
      )
        return null
      activeDocumentId = documentId
      storePage(documentId, result.page)
      return result.page
    })
    .catch((error: unknown) => {
      if (error instanceof Error) return null
      throw error
    })
    .finally(() => activeRequests.delete(key))
  activeRequests.set(key, operation)
  return operation
}

export function activeParsedDocumentPages(): readonly ParsedDocumentPage[] {
  return activeDocumentId ? parsedDocumentPages(activeDocumentId) : []
}

export function subscribeParsedDocumentPages(
  documentId: DocumentId,
  listener: (page: ParsedDocumentPage) => void,
): () => void {
  const current = listeners.get(documentId) ?? new Set<(page: ParsedDocumentPage) => void>()
  current.add(listener)
  listeners.set(documentId, current)
  return () => {
    current.delete(listener)
    if (current.size === 0) listeners.delete(documentId)
  }
}

export function clearParsedDocumentPages(documentId: DocumentId): void {
  generations.set(documentId, (generations.get(documentId) ?? 0) + 1)
  pagesByDocument.delete(documentId)
  listeners.delete(documentId)
  if (activeDocumentId === documentId) activeDocumentId = null
  for (const key of activeRequests.keys())
    if (key.startsWith(`${documentId}:`)) activeRequests.delete(key)
}

export function invalidateParsedDocumentPage(documentId: DocumentId, pageNumber: number): void {
  const key = requestKey(documentId, pageNumber)
  pageGenerations.set(key, (pageGenerations.get(key) ?? 0) + 1)
  pagesByDocument.get(documentId)?.delete(pageNumber)
  activeRequests.delete(key)
  if (activeDocumentId === documentId && parsedDocumentPages(documentId).length === 0)
    activeDocumentId = null
}
