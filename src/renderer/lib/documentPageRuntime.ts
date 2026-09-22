import type { ParsedDocumentPage } from "../../shared/documentPageModel"
import type { DocumentId } from "../../shared/schemas"

const pagesByDocument = new Map<DocumentId, Map<number, ParsedDocumentPage>>()
type ActiveRequest = {
  readonly promise: Promise<ParsedDocumentPage | null>
  readonly controller: AbortController
  consumers: number
}

const activeRequests = new Map<string, ActiveRequest>()
const listeners = new Map<DocumentId, Set<(page: ParsedDocumentPage) => void>>()
const generations = new Map<DocumentId, number>()
const pageGenerations = new Map<string, number>()
let activeDocumentId: DocumentId | null = null

function requestKey(documentId: DocumentId, pageNumber: number): string {
  return `${documentId}:${pageNumber}`
}

function waitForAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)
  let onAbort: (() => void) | undefined
  const aborted = new Promise<T>((_, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
  })
  return Promise.race([promise, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort)
  })
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
  options: {
    readonly forceOcr?: boolean
    readonly preparedOnly?: boolean
    readonly signal?: AbortSignal | undefined
  } = {},
): Promise<ParsedDocumentPage | null> {
  const key = requestKey(documentId, pageNumber)
  let active = activeRequests.get(key)
  if (options.forceOcr && !active) {
    invalidateParsedDocumentPage(documentId, pageNumber)
    active = activeRequests.get(key)
  }
  const cached = parsedDocumentPage(documentId, pageNumber)
  if (cached) return Promise.resolve(cached)
  const generation = generations.get(documentId) ?? 0
  const pageGeneration = pageGenerations.get(key) ?? 0
  let operation = active
  if (!operation) {
    const controller = new AbortController()
    const promise = window.ohmypaper
      .parseDocumentPage(
        {
          id: documentId,
          pageNumber,
          ...(options.forceOcr ? { forceOcr: true } : {}),
          ...(options.preparedOnly ? { preparedOnly: true } : {}),
        },
        controller.signal,
      )
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
        if (error instanceof Error && error.name === "AbortError") throw error
        if (error instanceof Error) return null
        throw error
      })
      .finally(() => {
        if (activeRequests.get(key)?.promise === promise) activeRequests.delete(key)
      })
    operation = { promise, controller, consumers: 0 }
    activeRequests.set(key, operation)
  }
  operation.consumers += 1
  return waitForAbort(operation.promise, options.signal).finally(() => {
    operation.consumers -= 1
    if (operation.consumers === 0) {
      operation.controller.abort()
      if (activeRequests.get(key)?.promise === operation.promise) activeRequests.delete(key)
    }
  })
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
  for (const [key, operation] of activeRequests) {
    if (!key.startsWith(`${documentId}:`)) continue
    operation.controller.abort()
    activeRequests.delete(key)
  }
}

export function invalidateParsedDocumentPage(documentId: DocumentId, pageNumber: number): void {
  const key = requestKey(documentId, pageNumber)
  pageGenerations.set(key, (pageGenerations.get(key) ?? 0) + 1)
  pagesByDocument.get(documentId)?.delete(pageNumber)
  const active = activeRequests.get(key)
  active?.controller.abort()
  activeRequests.delete(key)
  if (activeDocumentId === documentId && parsedDocumentPages(documentId).length === 0)
    activeDocumentId = null
}
