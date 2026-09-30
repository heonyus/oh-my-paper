import type { DocumentPageParseProgress } from "../shared/documentPageModel"
import type { DocumentRecord } from "../shared/schemas"
import { analysisFailureMessage } from "./documentAnalysisJobs"
import { type DocumentAnalysisPageParser, parseAnalysisPage } from "./documentAnalysisPageRunner"
import type { WorkspaceStore } from "./workspaceStore"

/** Local attempts per page before the document is marked failed. */
const MAX_PAGE_ATTEMPTS = 2

export type DocumentAnalysisProgress = {
  readonly completedPages: number
  readonly currentPage: number
  readonly stage: DocumentPageParseProgress["stage"]
  readonly attempt: number
  readonly maxAttempts: number
}

export type DocumentAnalysisOutcome =
  | { readonly status: "ready" }
  | { readonly status: "failed"; readonly completedPages: number; readonly message: string }

/**
 * The order to analyse a document in while someone reads page `reading`: the next three pages
 * first (they are where the reader goes), then the page on screen (its result waits until the
 * reader leaves it), then the rest ahead, then the pages already passed.
 */
export function readingPageOrder(reading: number, pageCount: number): readonly number[] {
  const current = Math.min(Math.max(Math.trunc(reading), 1), pageCount)
  const order: number[] = []
  for (let page = current + 1; page <= Math.min(current + 3, pageCount); page += 1) order.push(page)
  order.push(current)
  for (let page = current + 4; page <= pageCount; page += 1) order.push(page)
  for (let page = current - 1; page >= 1; page -= 1) order.push(page)
  return order
}

/**
 * Parses every page of `document`, `pageConcurrency` at a time, until one fails or
 * `cancelled` turns true. Never rejects: a local error fails the document. `readingPage` is
 * asked before each page is taken, so a reader moving through the paper steers the order.
 */
export async function analyseDocumentPages(input: {
  readonly document: DocumentRecord
  readonly parser: DocumentAnalysisPageParser
  readonly store: WorkspaceStore
  readonly signal: AbortSignal
  readonly pageConcurrency: number
  readonly cancelled: () => boolean
  readonly onProgress: (progress: DocumentAnalysisProgress) => void
  readonly readingPage?: () => number | null
}): Promise<DocumentAnalysisOutcome> {
  const { document } = input
  let completedPages = 0
  /** The first page failure's message; the other workers stop taking pages once it is set. */
  const failures: string[] = []
  const remaining = new Set(Array.from({ length: document.pageCount }, (_, index) => index + 1))
  const takePage = (): number | null => {
    if (failures.length > 0 || remaining.size === 0) return null
    const reading = input.readingPage?.() ?? null
    const pageNumber =
      reading === null
        ? Math.min(...remaining)
        : (readingPageOrder(reading, document.pageCount).find((page) => remaining.has(page)) ??
          Math.min(...remaining))
    remaining.delete(pageNumber)
    return pageNumber
  }
  const worker = async (): Promise<void> => {
    for (;;) {
      const pageNumber = takePage()
      if (pageNumber === null || input.cancelled()) return
      const result = await parseAnalysisPage({
        parser: input.parser,
        document,
        pageNumber,
        store: input.store,
        signal: input.signal,
        maxAttempts: MAX_PAGE_ATTEMPTS,
        onProgress: (stage, attempt) => {
          if (input.cancelled()) return
          const maxAttempts = MAX_PAGE_ATTEMPTS
          input.onProgress({ completedPages, currentPage: pageNumber, stage, attempt, maxAttempts })
        },
      })
      if (input.cancelled()) return
      if (result.status !== "ready") {
        failures.push(analysisFailureMessage(result))
        return
      }
      completedPages += 1
    }
  }
  try {
    const workers = Math.min(input.pageConcurrency, document.pageCount)
    await Promise.all(Array.from({ length: workers }, worker))
  } catch {
    return {
      status: "failed",
      completedPages,
      message: "문서 구조 분석 중 로컬 오류가 발생했습니다",
    }
  }
  const [message] = failures
  return message === undefined ? { status: "ready" } : { status: "failed", completedPages, message }
}
