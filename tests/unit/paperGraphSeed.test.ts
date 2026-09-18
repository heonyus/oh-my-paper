import { expect, it } from "vitest"
import { paperGraphSeed } from "../../src/renderer/components/knowledge/paperGraphSeed"

it("normalizes a pasted DOI URL without inventing article metadata", () => {
  const seed = paperGraphSeed(" https://doi.org/10.1038/nature14539 ")
  expect(seed?.identity.doi).toBe("10.1038/nature14539")
  expect(seed?.year).toBeNull()
  expect(seed?.authors).toEqual([])
})

it("recognizes a full OpenAlex URL and rejects arbitrary websites", () => {
  expect(paperGraphSeed("https://openalex.org/W2741809807")?.identity.openAlexId).toBe(
    "https://openalex.org/W2741809807",
  )
  expect(paperGraphSeed("https://example.org/W2741809807")).toBeNull()
  expect(paperGraphSeed("not a paper identifier")).toBeNull()
})
