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
/** Pages left as PDF.js text because the server could make no structured parse of them. */
const settledTextPages = new Set<string>()
let activeDocumentId: DocumentId | null = null

/**
 * How a page is asked for: only if already parsed (`prepared`), the first readable page
 * (`first`), or the structured parse when one can be made (`structure`). Each waits on its own
 * request, so a quick look never answers a request that needs the structured page.
 */
type LoadMode = "prepared" | "first" | "structure"

function requestKey(documentId: DocumentId, pageNumber: number): string {
  return `${documentId}:${pageNumber}`
}

function isTextOnly(page: ParsedDocumentPage): boolean {
  return page.parser === "NativeText-1.0"
}

/** Whether the page has no parse yet, or only PDF.js text a structured parse may replace. */
export function awaitingStructuredPage(documentId: DocumentId, pageNumber: number): boolean {
  const page = parsedDocumentPage(documentId, pageNumber)
  return !page || (isTextOnly(page) && !settledTextPages.has(requestKey(documentId, pageNumber)))
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

/** Keeps the page, unless it is PDF.js text and a structured parse is already kept. */
function storePage(
  documentId: DocumentId,
  page: ParsedDocumentPage,
  mode: LoadMode,
): ParsedDocumentPage {
  const pages = pagesByDocument.get(documentId) ?? new Map<number, ParsedDocumentPage>()
  const kept = pages.get(page.pageNumber)
  if (kept && !isTextOnly(kept) && isTextOnly(page)) return kept
  // Asked for its structure and still given text: no structured parse can be made of it.
  if (mode === "structure" && isTextOnly(page))
    settledTextPages.add(requestKey(documentId, page.pageNumber))
  pages.set(page.pageNumber, page)
  pagesByDocument.set(documentId, pages)
  for (const listener of listeners.get(documentId) ?? []) listener(page)
  return page
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
    /** The structured parse when one can be made; see `awaitStructure` in the request. */
    readonly awaitStructure?: boolean
    readonly signal?: AbortSignal | undefined
  } = {},
): Promise<ParsedDocumentPage | null> {
  const mode: LoadMode = options.preparedOnly
    ? "prepared"
    : options.awaitStructure
      ? "structure"
      : "first"
  const pageKey = requestKey(documentId, pageNumber)
  const key = `${pageKey}:${mode}`
  let active = activeRequests.get(key)
  if (options.forceOcr && !active) {
    invalidateParsedDocumentPage(documentId, pageNumber)
    active = activeRequests.get(key)
  }
  const cached = parsedDocumentPage(documentId, pageNumber)
  // PDF.js text kept from a quick read does not answer a request that may get more.
  if (cached && (mode === "first" || !awaitingStructuredPage(documentId, pageNumber)))
    return Promise.resolve(cached)
  const generation = generations.get(documentId) ?? 0
  const pageGeneration = pageGenerations.get(pageKey) ?? 0
  let operation = active
  if (!operation) {
    const controller = new AbortController()
    const promise = window.ohmypaper
      .parseDocumentPage(
        {
          id: documentId,
          pageNumber,
          ...(options.forceOcr ? { forceOcr: true } : {}),
          ...(mode === "prepared" ? { preparedOnly: true } : {}),
          ...(mode === "structure" ? { awaitStructure: true } : {}),
        },
        controller.signal,
      )
      .then((result) => {
        if (
          (generations.get(documentId) ?? 0) !== generation ||
          (pageGenerations.get(pageKey) ?? 0) !== pageGeneration
        )
          return null
        // Nothing new: whatever this session already read of the page still stands.
        if (result.status !== "ready") return parsedDocumentPage(documentId, pageNumber)
        activeDocumentId = documentId
        return storePage(documentId, result.page, mode)
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
  for (const key of settledTextPages)
    if (key.startsWith(`${documentId}:`)) settledTextPages.delete(key)
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
  settledTextPages.delete(key)
  for (const [requestKeyWithMode, active] of activeRequests) {
    if (!requestKeyWithMode.startsWith(`${key}:`)) continue
    active.controller.abort()
    activeRequests.delete(requestKeyWithMode)
  }
  if (activeDocumentId === documentId && parsedDocumentPages(documentId).length === 0)
    activeDocumentId = null
}
