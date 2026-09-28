import { describe, expect, it } from "vitest"
import { confidentSource, notePageWindow, relatedSources } from "../../src/renderer/lib/noteSources"

const sources = [
  { id: "page:3:block:1", page: 3, text: "Gist-first reading raised accuracy from 41% to 59%." },
  { id: "page:3:block:2", page: 3, text: "Participants preferred the always-visible translation." },
  { id: "page:4:block:0", page: 4, text: "The study was approved by the review board." },
] as const

describe("note sources", () => {
  it("looks at the page being read first, then its neighbours", () => {
    expect(notePageWindow(3, 10)).toEqual([3, 4, 2, 5, 1])
    expect(notePageWindow(1, 1)).toEqual([1])
  })

  it("shows a passage only when it is close and clearly ahead", () => {
    expect(
      confidentSource(
        [
          { id: "page:3:block:2", score: 0.66 },
          { id: "page:3:block:1", score: 0.43 },
        ],
        sources,
      ),
    ).toMatchObject({ id: "page:3:block:2", page: 3, score: 0.66 })
    expect(
      confidentSource(
        [
          { id: "page:3:block:2", score: 0.45 },
          { id: "page:3:block:1", score: 0.43 },
        ],
        sources,
      ),
    ).toBeNull()
    expect(confidentSource([{ id: "page:3:block:2", score: 0.31 }], sources)).toBeNull()
  })

  it("hands the tutor looser related passages", () => {
    expect(
      relatedSources(
        [
          { id: "page:3:block:1", score: 0.52 },
          { id: "page:3:block:2", score: 0.35 },
          { id: "page:4:block:0", score: 0.2 },
        ],
        sources,
      ).map((source) => source.id),
    ).toEqual(["page:3:block:1", "page:3:block:2"])
  })
})
