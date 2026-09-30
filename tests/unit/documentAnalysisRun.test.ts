import { describe, expect, it } from "vitest"
import { readingPageOrder } from "../../src/electron/documentAnalysisRun"

describe("readingPageOrder", () => {
  it("takes the next three pages, then the page on screen, the rest ahead, then behind", () => {
    expect(readingPageOrder(2, 8)).toEqual([3, 4, 5, 2, 6, 7, 8, 1])
    expect(readingPageOrder(1, 3)).toEqual([2, 3, 1])
  })

  it("stays within the document at its ends", () => {
    expect(readingPageOrder(8, 8)).toEqual([8, 7, 6, 5, 4, 3, 2, 1])
    expect(readingPageOrder(20, 4)).toEqual([4, 3, 2, 1])
    expect(readingPageOrder(0, 3)).toEqual([2, 3, 1])
  })
})
