import { describe, expect, it } from "vitest"
import { withPageTranslationTextCitationLinks } from "../../src/renderer/lib/pageTranslationCitations"

const citation = {
  key: "3",
  title: "A paper with a deliberately long title",
  authors: "Example Author",
  year: 2020,
  venue: "Journal",
  rawText: "Example Author. 2020. https://arxiv.org/abs/1234.5678v2",
  doi: null,
  contexts: [],
} as const

describe("page translation citation links", () => {
  it("links explicit bracket citations without changing ordinary numbers or URLs", () => {
    const source = "Section 3.2 cites [3]. See https://arxiv.org/abs/1234.5678v2."

    const linked = withPageTranslationTextCitationLinks(source, [citation])

    expect(linked).toContain("Section 3.2")
    expect(linked).toContain("https://arxiv.org/abs/1234.5678v2")
    expect(linked).toContain("[3](https://arxiv.org/abs/1234.5678v2)")
    expect(linked).not.toContain("Section([3]")
  })
})
