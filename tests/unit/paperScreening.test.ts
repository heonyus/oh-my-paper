// @vitest-environment node

import { describe, expect, it } from "vitest"
import { sanitizeCitations } from "../../src/electron/agentAnswer"
import { parseJsonObject } from "../../src/electron/agentCompletion"
import { parseJudgeResponse } from "../../src/electron/paperJudge"
import { fallbackBrief, parseSearchBrief } from "../../src/electron/paperSearchBrief"

describe("parseSearchBrief", () => {
  it("reads a fenced plan, trims lists and treats year 0 as unset", () => {
    const brief = parseSearchBrief(
      [
        "Here is the plan:",
        "```json",
        JSON.stringify({
          interpretation: "파라미터 메모리 연구",
          queries: ["a b", "a b", "c d", "e f", "g h", "i j", "k l", "m n"],
          semanticQuery: "Papers that store documents in weights.",
          criteria: ["x", "stores documents"],
          yearFrom: 0,
          yearTo: 2025,
        }),
        "```",
      ].join("\n"),
    )
    expect(brief).toEqual({
      interpretation: "파라미터 메모리 연구",
      queries: ["a b", "c d", "e f", "g h", "i j"],
      semanticQuery: "Papers that store documents in weights.",
      criteria: ["stores documents"],
      yearFrom: null,
      yearTo: 2025,
    })
  })

  it("rejects plans without searchable queries", () => {
    expect(parseSearchBrief('{"queries": [], "semanticQuery": "x y z"}')).toBeNull()
    expect(parseSearchBrief("no json here")).toBeNull()
  })

  it("never sends a Korean fallback question to keyword indices", () => {
    expect(fallbackBrief("긴 문서 기억").queries).toEqual([])
    expect(fallbackBrief("long document memory").queries).toEqual(["long document memory"])
  })
})

describe("parseJudgeResponse", () => {
  it("keeps judgments for known ids only and clears reasons for low scores", () => {
    const parsed = parseJudgeResponse(
      JSON.stringify({
        judgments: [
          { id: "p1", score: 3, reason: "핵심 방법" },
          { id: "p2", score: 1, reason: "주변적" },
          { id: "p9", score: 3, reason: "unknown" },
          { id: "p3", score: "2", reason: "문자열 점수" },
        ],
        nextQueries: ["a", "memory editing", "x y", "z w", "extra query"],
      }),
      new Set(["p1", "p2", "p3"]),
    )
    expect(parsed?.judgments).toEqual(
      new Map([
        ["p1", { score: 3, reason: "핵심 방법" }],
        ["p2", { score: 1, reason: "" }],
        ["p3", { score: 2, reason: "문자열 점수" }],
      ]),
    )
    expect(parsed?.nextQueries).toEqual(["memory editing", "x y", "z w"])
  })

  it("returns null when no candidate was judged", () => {
    expect(parseJudgeResponse('{"judgments": []}', new Set(["p1"]))).toBeNull()
  })
})

describe("answer helpers", () => {
  it("extracts JSON surrounded by prose", () => {
    expect(parseJsonObject('sure: {"a": 1} done')).toEqual({ a: 1 })
    expect(parseJsonObject("nothing")).toBeNull()
  })

  it("keeps valid citations, trims partial lists and drops unknown library refs", () => {
    expect(sanitizeCitations("[1] [2, 5] [3-4] [L1] [L2] [6]", 4, 1)).toBe("[1] [2] [3-4] [L1]  ")
  })
})
