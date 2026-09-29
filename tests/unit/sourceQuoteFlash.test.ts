import { describe, expect, it } from "vitest"
import { sourceContainsQuote } from "../../src/renderer/lib/sourceQuoteFlash"

const page =
  "We ask each reader to write three lines from memory and compare them with the paper,\nquoting the supporting sen-\ntence for every verdict."

describe("source quote matching", () => {
  it("finds a quote across line breaks and hyphenation", () => {
    expect(sourceContainsQuote(page, "quoting the supporting sentence for every verdict")).toBe(
      true,
    )
  })

  it("rejects a quote the source does not contain", () => {
    expect(sourceContainsQuote(page, "an invented line about the method")).toBe(false)
  })

  it("does not count a short quote that would match too many places", () => {
    expect(sourceContainsQuote(page, "the paper")).toBe(false)
    expect(sourceContainsQuote("Abstract.", "Abstract")).toBe(true)
  })
})
