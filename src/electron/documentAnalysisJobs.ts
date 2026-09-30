import type { DocumentAnalysisJob } from "../shared/documentAnalysis"
import type {
  DocumentPageParseProgress,
  DocumentPageParseResult,
} from "../shared/documentPageModel"
import type { DocumentRecord } from "../shared/schemas"

/** A job's title within the snapshot's bounds, whatever the PDF's metadata held. */
function jobTitle(document: DocumentRecord): string {
  const bounded = (value: string): string => value.trim().slice(0, 512).trim()
  return bounded(document.title) || bounded(document.name) || "제목 없는 문서"
}

export function analysisFailureMessage(result: DocumentPageParseResult): string {
  if (result.status === "ready") return ""
  if (result.reason === "runtime_missing") return "로컬 PaddleOCR-VL 설치가 필요합니다"
  if (result.reason === "model_unavailable") return "로컬 분석 모델을 시작하지 못했습니다"
  return "문서 구조 분석을 완료하지 못했습니다"
}

export function queuedAnalysisJob(document: DocumentRecord): DocumentAnalysisJob {
  return {
    id: document.id,
    title: jobTitle(document),
    pageCount: document.pageCount,
    completedPages: 0,
    state: "queued",
  }
}

/** Shown while the OCR engine downloads; the document is analysed once it is ready. */
export const ENGINE_WAIT_MESSAGE = "문서 분석 엔진을 받는 중 · 끝나면 자동으로 분석합니다"

export function waitingAnalysisJob(document: DocumentRecord): DocumentAnalysisJob {
  return {
    id: document.id,
    title: jobTitle(document),
    pageCount: document.pageCount,
    completedPages: 0,
    state: "queued",
    message: ENGINE_WAIT_MESSAGE,
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
    title: jobTitle(input.document),
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
    title: jobTitle(document),
    pageCount: document.pageCount,
    completedPages,
    state: "failed",
    message,
  }
}
