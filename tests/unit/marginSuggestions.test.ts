import { describe, expect, it, vi } from "vitest"
import { marginPageWindow } from "../../src/renderer/lib/marginCandidates"
import { marginNoteText, suggestForNote } from "../../src/renderer/lib/marginSuggestions"
import type { JevDecisionRequest } from "../../src/shared/aiDecision"

const candidates = [
  { id: "p1-b1", page: 1, text: "Readers skim machine translations and skip the English source." },
  { id: "p2-b4", page: 2, text: "Gist-first reading raised accuracy from 41% to 59%." },
] as const

function decision(choiceId: string, probability: number) {
  return { task: "relevance" as const, choiceId, probability, model: "jev", provider: "test" }
}

describe("margin suggestions", () => {
  it("looks at the page being read first, then its neighbours", () => {
    expect(marginPageWindow(3, 10)).toEqual([3, 4, 2, 5, 1])
    expect(marginPageWindow(1, 2)).toEqual([1, 2])
  })

  it("keeps only the latest part of a long note block", () => {
    const text = `${"앞 ".repeat(400)}마지막 문장이다.`
    expect(marginNoteText(text).endsWith("마지막 문장이다.")).toBe(true)
    expect(marginNoteText(text).length).toBeLessThanOrEqual(600)
  })

  it("returns the paragraph the note rests on and the one that contradicts it", async () => {
    const decide = vi.fn(async (request: JevDecisionRequest) =>
      request.instructions?.includes("contradicts")
        ? decision("p2-b4", 0.82)
        : decision("p1-b1", 0.93),
    )
    const suggestions = await suggestForNote("번역만 보면 원문을 건너뛴다.", candidates, decide)

    expect(suggestions).toEqual([
      { kind: "support", page: 1, text: candidates[0].text, probability: 0.93 },
      { kind: "conflict", page: 2, text: candidates[1].text, probability: 0.82 },
    ])
    expect(decide.mock.calls[0]?.[0].candidates.map((candidate) => candidate.id)).toEqual([
      "p1-b1",
      "p2-b4",
    ])
  })

  it("stays silent when Jev chooses none or is unsure", async () => {
    const decide = vi.fn(async (request: JevDecisionRequest) =>
      request.instructions?.includes("contradicts")
        ? decision("p2-b4", 0.5)
        : decision("none", 0.95),
    )
    expect(await suggestForNote("점심으로 김치찌개를 먹었다.", candidates, decide)).toEqual([])
  })

  it("never shows one paragraph as both support and conflict", async () => {
    const decide = vi.fn(async () => decision("p1-b1", 0.9))
    const suggestions = await suggestForNote("번역만 본다.", candidates, decide)
    expect(suggestions.map((suggestion) => suggestion.kind)).toEqual(["support"])
  })

  it("reports a failure only when both decisions fail", async () => {
    const decide = vi.fn(async () => {
      throw new Error("offline")
    })
    await expect(suggestForNote("번역만 본다.", candidates, decide)).rejects.toThrow("offline")
    expect(await suggestForNote("번역만 본다.", [], decide)).toEqual([])
  })
})
