import type { DocumentAnalysisJob } from "../shared/documentAnalysis"
import type {
  DocumentPageParseProgress,
  DocumentPageParseResult,
} from "../shared/documentPageModel"
import type { DocumentRecord } from "../shared/schemas"
export function analysisFailureMessage(result: DocumentPageParseResult): string {
  if (result.status === "ready") return ""
  if (result.reason === "runtime_missing") return "로컬 PaddleOCR-VL 설치가 필요합니다"
  if (result.reason === "model_unavailable") return "로컬 분석 모델을 시작하지 못했습니다"
  return "문서 구조 분석을 완료하지 못했습니다"
}

export function queuedAnalysisJob(document: DocumentRecord): DocumentAnalysisJob {
  return {
    id: document.id,
    title: document.title,
    pageCount: document.pageCount,
    completedPages: 0,
    state: "queued",
  }
}

export function runningAnalysisJob(input: {
  readonly document: DocumentRecord
  readonly completedPages: number
  readonly currentPage: number
  readonly stage: DocumentPageParseProgress["stage"]
  readonly attempt: number
  readonly maxAttempts: number
}): DocumentAnalysisJob {
  return {
    id: input.document.id,
    title: input.document.title,
    pageCount: input.document.pageCount,
    completedPages: input.completedPages,
    currentPage: input.currentPage,
    stage: input.stage,
    engine: "local",
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    state: "running",
  }
}

export function failedAnalysisJob(
  document: DocumentRecord,
  completedPages: number,
  message: string,
): DocumentAnalysisJob {
  return {
    id: document.id,
    title: document.title,
    pageCount: document.pageCount,
    completedPages,
    state: "failed",
    message,
  }
}
