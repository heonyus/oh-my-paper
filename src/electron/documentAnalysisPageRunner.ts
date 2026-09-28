import type {
  DocumentPageParseProgress,
  DocumentPageParseResult,
} from "../shared/documentPageModel"
import type { DocumentId, DocumentRecord } from "../shared/schemas"
import type { WorkspaceStore } from "./workspaceStore"

export type DocumentAnalysisPageParser = {
  readonly parse: (input: {
    readonly documentId: DocumentId
    readonly pageNumber: number
    readonly store: WorkspaceStore
    readonly signal: AbortSignal
    readonly requireStructuredOcr?: boolean
    readonly onProgress?: (progress: DocumentPageParseProgress) => void
  }) => Promise<DocumentPageParseResult>
}

export async function parseAnalysisPage(input: {
  readonly parser: DocumentAnalysisPageParser
  readonly document: DocumentRecord
  readonly pageNumber: number
  readonly store: WorkspaceStore
  readonly signal: AbortSignal
  readonly maxAttempts: number
  readonly onProgress: (stage: DocumentPageParseProgress["stage"], attempt: number) => void
}): Promise<DocumentPageParseResult> {
  let result: DocumentPageParseResult = { status: "unavailable", reason: "execution_failed" }
  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    // The parser reports "engine-starting" itself when it has to wait for its engine.
    input.onProgress("page-rendering", attempt)
    try {
      result = await input.parser.parse({
        documentId: input.document.id,
        pageNumber: input.pageNumber,
        store: input.store,
        signal: input.signal,
        requireStructuredOcr: true,
        onProgress: ({ stage }) => input.onProgress(stage, attempt),
      })
    } catch (error) {
      if (input.signal.aborted) throw error
      result = { status: "unavailable", reason: "execution_failed" }
    }
    if (result.status === "ready") return result
  }
  return result
}
