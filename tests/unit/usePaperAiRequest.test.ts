import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  aiRoleForAction,
  groundedAiRequest,
  paperContextModeForAction,
  usePaperAiRequest,
  usesDirectPaperCompletion,
} from "../../src/renderer/lib/usePaperAiRequest"
import { documentRecordSchema } from "../../src/shared/schemas"

const documentFixture = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 12,
  title: "MedAgentGym",
  authors: ["Researcher"],
  year: 2026,
  doi: null,
  kind: "research_paper",
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

describe("paper-grounded request", () => {
  it("routes user actions into the bounded job role consumed by the scheduler", () => {
    expect(aiRoleForAction("page_translation")).toBe("translation")
    expect(aiRoleForAction("citation_assessment")).toBe("citation")
    expect(aiRoleForAction("figure")).toBe("reader")
  })

  it("uses non-streaming structured completion only for page translation without deltas", () => {
    expect(usesDirectPaperCompletion("page_translation", false)).toBe(true)
    expect(usesDirectPaperCompletion("page_translation", true)).toBe(false)
    expect(usesDirectPaperCompletion("translation", false)).toBe(false)
  })

  it("injects request-specific context, cached summary, and local source overview", () => {
    const request = groundedAiRequest(
      documentFixture,
      "## 캐시된 요약\n- 실행 가능한 훈련 환경",
      "Abstract: 72,413 tasks across 12 scenarios.",
      {
        action: "figure",
        page: 2,
        quote: "Figure 1",
        before: "",
        after: "",
        paperContext: "현재 질문과 관련된 평가 문맥",
        sectionContext: "모델 성능 평가 절",
      },
    )

    expect(request.documentId).toBe(documentFixture.id)
    expect(request.paperContext).toContain("현재 질문과 관련된 평가 문맥")
    expect(request.paperContext).toContain("캐시된 논문 요약")
    expect(request.paperContext).toContain("로컬 원문 개요")
    expect(request.paperContext).toContain("문서 유형: 연구 논문")
    expect(request.sectionContext).toBe("모델 성능 평가 절")
  })

  it("routes page translation through minimal context", () => {
    expect(paperContextModeForAction("page_translation")).toBe("minimal")
    expect(paperContextModeForAction("figure")).toBe("grounded")
  })

  it("cancels active AI job via cancelAiJob when AbortSignal aborts", async () => {
    const cancelAiJob = vi.fn(async () => {})
    const startAiJob = vi.fn(async () => {})
    let emitJobEvent: (event: unknown) => void = () => {}
    const onAiJobEvent = vi.fn((cb: (event: unknown) => void) => {
      emitJobEvent = cb
      return () => {
        emitJobEvent = () => {}
      }
    })

    Object.defineProperty(window, "scourgify", {
      value: {
        cancelAiJob,
        startAiJob,
        onAiJobEvent,
        runAi: vi.fn(),
      },
      configurable: true,
      writable: true,
    })

    const { result } = renderHook(() => usePaperAiRequest(documentFixture, []))
    const controller = new AbortController()

    const promise = result.current(
      { action: "page_translation", page: 1, quote: "text", before: "", after: "" },
      vi.fn(),
      controller.signal,
    )

    expect(startAiJob).toHaveBeenCalled()
    const calls = startAiJob.mock.calls as unknown as Array<[{ jobId: string }]>
    const startedJobId = calls[0]?.[0]?.jobId ?? "job:test"

    controller.abort()

    expect(cancelAiJob).toHaveBeenCalledWith(startedJobId)

    // Simulate the cancelled event from main
    emitJobEvent({ kind: "cancelled", jobId: startedJobId, sequence: 1 })

    await expect(promise).rejects.toThrow("cancelled")
  })
})
