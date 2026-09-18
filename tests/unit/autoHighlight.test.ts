import { describe, expect, it } from "vitest"
import {
  AUTO_HIGHLIGHT_MAX_PASSAGES,
  parseAutoHighlightResponse,
} from "../../src/renderer/lib/autoHighlight"

const long = (n: number): string => "关".repeat(n)

describe("auto highlight response parsing", () => {
  it("parses the documented JSON shape", () => {
    const text = JSON.stringify({
      passages: [
        {
          quote: "Scourgify treats document pages as spatially addressable artifacts.",
          reason: "核心方法",
        },
        { quote: "PDF Ingestion 142 pg/sec VERIFIED.", reason: "决定性结果" },
      ],
    })
    const passages = parseAutoHighlightResponse(text)
    expect(passages).toHaveLength(2)
    expect(passages[0]?.reason).toBe("核心方法")
  })

  it("accepts a bare array and markdown fences", () => {
    const text = '```json\n[{"quote":"' + long(30) + '","reason":"r"}]\n```'
    expect(parseAutoHighlightResponse(text)).toHaveLength(1)
  })

  it("rejects paraphrase-length, duplicates and non-verbatim junk", () => {
    const text = JSON.stringify({
      passages: [
        { quote: "too short", reason: "x" },
        { quote: long(400), reason: "x" },
        { quote: long(40), reason: "x" },
        { quote: long(40), reason: "dup" },
        { quote: long(40) },
        "garbage",
      ],
    })
    const passages = parseAutoHighlightResponse(text)
    expect(passages).toHaveLength(1)
    expect(passages[0]?.reason).toBe("x")
  })

  it("bounds the passage count", () => {
    const text = JSON.stringify({
      passages: Array.from({ length: 12 }, (_, i) => ({
        quote: long(40) + i,
        reason: "r" + i,
      })),
    })
    expect(parseAutoHighlightResponse(text)).toHaveLength(AUTO_HIGHLIGHT_MAX_PASSAGES)
  })

  it("returns empty for malformed output", () => {
    expect(parseAutoHighlightResponse("not json at all")).toHaveLength(0)
    expect(parseAutoHighlightResponse('{"passages":"nope"}')).toHaveLength(0)
    expect(parseAutoHighlightResponse("")).toHaveLength(0)
  })

  it("normalizes whitespace inside quotes for source matching", () => {
    const text = JSON.stringify({
      passages: [{ quote: "  multi   line\n\nquote   with spacing ", reason: " r " }],
    })
    const passages = parseAutoHighlightResponse(text)
    expect(passages[0]?.quote).toBe("multi line quote with spacing")
  })
})
