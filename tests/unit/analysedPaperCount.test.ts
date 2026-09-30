import { describe, expect, it } from "vitest"
import {
  analysedPaperCount,
  documentAnalysisJobSchema,
  snapshotOfAnalysisJobs,
} from "../../src/shared/documentAnalysis"

function job(index: number, state: "queued" | "running" | "failed") {
  return documentAnalysisJobSchema.parse({
    id: index.toString(16).padStart(16, "0"),
    title: `paper-${index}`,
    pageCount: 4,
    completedPages: 0,
    state,
    ...(state === "running"
      ? { currentPage: 1, stage: "document-analyzing", engine: "local", attempt: 1, maxAttempts: 2 }
      : {}),
    ...(state === "failed" ? { message: "문서 구조 분석을 완료하지 못했습니다" } : {}),
  })
}

describe("analysedPaperCount", () => {
  it("counts every paper without an unfinished job as analysed", () => {
    const snapshot = snapshotOfAnalysisJobs([job(1, "queued"), job(2, "running"), job(3, "failed")])
    expect(analysedPaperCount(snapshot, 5)).toBe(2)
    expect(analysedPaperCount(snapshotOfAnalysisJobs([]), 3)).toBe(3)
  })

  it("includes the jobs a large snapshot only counts", () => {
    const jobs = Array.from({ length: 70 }, (_, index) => job(index + 1, "queued"))
    expect(analysedPaperCount(snapshotOfAnalysisJobs(jobs), 80)).toBe(10)
    expect(analysedPaperCount(snapshotOfAnalysisJobs(jobs), 60)).toBe(0)
  })
})
