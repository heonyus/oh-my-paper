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
 * Parses every page of `document`, `pageConcurrency` at a time, until one fails or
 * `cancelled` turns true. Never rejects: a local error fails the document.
 */
export async function analyseDocumentPages(input: {
  readonly document: DocumentRecord
  readonly parser: DocumentAnalysisPageParser
  readonly store: WorkspaceStore
  readonly signal: AbortSignal
  readonly pageConcurrency: number
  readonly cancelled: () => boolean
  readonly onProgress: (progress: DocumentAnalysisProgress) => void
}): Promise<DocumentAnalysisOutcome> {
  const { document } = input
  let completedPages = 0
  /** The first page failure's message; the other workers stop taking pages once it is set. */
  const failures: string[] = []
  let nextPage = 1
  const takePage = (): number | null => {
    if (failures.length > 0 || nextPage > document.pageCount) return null
    const pageNumber = nextPage
    nextPage += 1
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
