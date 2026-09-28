import { describe, expect, it } from "vitest"
import {
  ownSummaryCheckInput,
  parseOwnSummaryCheck,
  UNANSWERED_NOTE,
  UNVERIFIED_NOTE,
  verifiedCheckItems,
} from "../../src/renderer/lib/ownSummaryCheck"

const pageTexts = [
  "Abstract. Readers who rely on generated summaries recall less of what they read.",
  "We ask each reader to write three lines from memory and compare them with the paper,\nquoting the supporting sen-\ntence for every verdict.",
]

describe("own summary check", () => {
  it("sends only the lines the reader wrote", () => {
    expect(
      JSON.parse(ownSummaryCheckInput({ problem: " 기억이 줄어든다 ", method: "", result: "  " })),
    ).toEqual({ problem: "기억이 줄어든다" })
  })

  it("parses fenced JSON and rejects an unknown verdict", () => {
    const fenced =
      '```json\n{"items":[{"line":"method","verdict":"missing","note":"비교 대상이 빠졌습니다.","page":2,"quote":"compare them with the paper"}]}\n```'
    expect(parseOwnSummaryCheck(fenced)).toEqual([
      expect.objectContaining({ line: "method", verdict: "missing", page: 2 }),
    ])
    expect(() =>
      parseOwnSummaryCheck('{"items":[{"line":"method","verdict":"great","note":"좋아요"}]}'),
    ).toThrow()
  })

  it("keeps a verdict whose quote is on the page it names, across line breaks", () => {
    const [item] = verifiedCheckItems(
      [
        {
          line: "method",
          verdict: "match",
          note: "방법을 정확히 짚었습니다.",
          page: 2,
          quote: "quoting the supporting sentence for every verdict",
        },
      ],
      ["method"],
      pageTexts,
    )
    expect(item).toEqual({
      line: "method",
      verdict: "match",
      note: "방법을 정확히 짚었습니다.",
      page: 2,
      quote: "quoting the supporting sentence for every verdict",
    })
  })

  it("never keeps a verdict the paper cannot show", () => {
    const items = verifiedCheckItems(
      [
        {
          line: "problem",
          verdict: "match",
          note: "맞습니다.",
          page: 1,
          quote: "an invented line",
        },
        {
          line: "method",
          verdict: "diverges",
          note: "다릅니다.",
          page: 1,
          quote: "compare them with the paper",
        },
        { line: "result", verdict: "missing", note: "빠졌습니다.", page: 1, quote: "recall less" },
      ],
      ["problem", "method", "result"],
      pageTexts,
    )
    expect(items.map((item) => item.verdict)).toEqual([
      "unverifiable",
      "unverifiable",
      "unverifiable",
    ])
    expect(items.every((item) => item.note === UNVERIFIED_NOTE && item.quote === null)).toBe(true)
  })

  it("answers every written line once, in order, and ignores lines the reader left blank", () => {
    const items = verifiedCheckItems(
      [
        {
          line: "result",
          verdict: "unverifiable",
          note: "결과 부분이 없습니다.",
          page: 3,
          quote: "x",
        },
        { line: "method", verdict: "match", note: "무시됩니다.", page: 2, quote: "compare them" },
      ],
      ["problem", "result"],
      pageTexts,
    )
    expect(items).toEqual([
      { line: "problem", verdict: "unverifiable", note: UNANSWERED_NOTE, page: null, quote: null },
      {
        line: "result",
        verdict: "unverifiable",
        note: "결과 부분이 없습니다.",
        page: null,
        quote: null,
      },
    ])
  })
})
