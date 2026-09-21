import { describe, expect, it } from "vitest"
import type { AutoHighlightCandidate } from "../../src/renderer/lib/autoHighlightCandidates"
import {
  jevHighlightPassage,
  selectJevHighlightPassages,
} from "../../src/renderer/lib/autoHighlightJev"
import type { JevDecisionRequest, JevDecisionResult } from "../../src/shared/aiDecision"

const candidates: readonly AutoHighlightCandidate[] = [
  {
    id: "native:p1:s1",
    page: 1,
    quote: "The method introduces a source grounded memory.",
    location: { kind: "native" },
  },
  {
    id: "native:p2:s1",
    page: 2,
    quote: "The results improve the reported benchmark score.",
    location: { kind: "native" },
  },
]

const result = (choiceId: string): JevDecisionResult => ({
  task: "highlight",
  choiceId,
  probability: 0.5,
  model: "typesafe/jev-1.13",
  provider: "TypeSafe",
})

describe("Jev auto highlight selection", () => {
  it("rejects an already selected candidate and unknown IDs", () => {
    const goal = { label: "주요 기여", reason: "핵심 기여" } as const
    expect(
      jevHighlightPassage(result("native:p1:s1"), goal, candidates, new Set(["native:p1:s1"])),
    ).toBeNull()
    expect(jevHighlightPassage(result("missing"), goal, candidates, new Set())).toBeNull()
  })

  it("uses at most three sequential bounded decisions and deduplicates choices", async () => {
    const requests: JevDecisionRequest[] = []
    const decideAi = async (request: JevDecisionRequest): Promise<JevDecisionResult> => {
      requests.push(request)
      return result(request.instructions?.includes("결정적 결과") ? "native:p2:s1" : "native:p1:s1")
    }

    const selected = await selectJevHighlightPassages(
      "paper",
      candidates,
      decideAi,
      new AbortController().signal,
    )

    expect(selected.passages.map((passage) => passage.candidateId)).toEqual([
      "native:p1:s1",
      "native:p2:s1",
    ])
    expect(requests.length).toBeLessThanOrEqual(3)
    expect(new Set(selected.passages.map((passage) => passage.candidateId)).size).toBe(2)
  })

  it("propagates cancellation so the UI can settle the run", async () => {
    const controller = new AbortController()
    const decideAi = async (
      _request: JevDecisionRequest,
      signal: AbortSignal,
    ): Promise<JevDecisionResult> => {
      controller.abort()
      if (signal.aborted) throw new Error("cancelled")
      return result("none")
    }

    await expect(
      selectJevHighlightPassages("paper", candidates, decideAi, controller.signal),
    ).rejects.toThrow("cancelled")
  })
})
