import { describe, expect, it } from "vitest"
import { extractReferencesFromText } from "../../src/renderer/lib/structureDetector"

describe("reference extraction", () => {
  it("indexes numbered and author-year bibliography entries", () => {
    const references = extractReferencesFromText(`
      References
      [12] Jane Doe. 2024. A Memory Retrieval Paper. KDD.
      Gyubok Lee, Hyeonji Hwang, and Edward Choi. 2022. EHRSQL: A practical text-to-SQL benchmark. NeurIPS.
    `)

    expect(references["12"]?.title).toContain("Memory Retrieval")
    expect(references["lee-2022"]?.title).toContain("EHRSQL")
    expect(references["lee-2022"]?.year).toBe(2022)
  })
})
