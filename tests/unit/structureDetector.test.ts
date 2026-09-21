import { describe, expect, it } from "vitest"
import {
  detectPageStructures,
  extractReferencesFromText,
} from "../../src/renderer/lib/structureDetector"

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

  it("parses small-caps reference headings and year-at-end bibliography styles", () => {
    const references = extractReferencesFromText(`
      DPO-14B MedCopilot-14B (GRPO) Figure 16 qualitative comparison.
      R EFERENCES
      Daya Guo, Dejian Yang, Haowei Zhang, Junxiao Song, Ruoyu Zhang, Runxin Xu,
      Qihao Zhu, Shirong Ma, Peiyi Wang, Xiao Bi, et al. Deepseek-r1: Incentivizing
      reasoning capability in llms via reinforcement learning. arXiv preprint
      arXiv:2501.12948, 2025.
      Siyuan Guo, Cheng Deng, Ying Wen, Hechang Chen, Yi Chang, and Jun Wang.
      DS-agent: Automated data science by empowering large language models with
      case-based reasoning. ICML, 2024.
      A L IMITATIONS AND B ROADER I MPACTS
      DeepSeek-R1 (Guo et al., 2025). DPO-14B MedCopilot-14B GRPO Figure 16.
    `)

    expect(references["guo-2025"]?.title).toContain("Deepseek-r1")
    expect(references["guo-2025"]?.title).not.toContain("Figure 16")
    expect(Object.values(references).filter((reference) => reference.year === 2025)).toHaveLength(1)
  })

  it("parses a long year-at-end bibliography within the interaction budget", () => {
    const unfinishedEntry =
      "Researcher Name. Reliable clinical agent benchmark with reproducible evaluation details and no terminal publication year. "
    const source = `R EFERENCES\n${unfinishedEntry.repeat(700)}`

    const started = performance.now()
    const references = extractReferencesFromText(source)
    const elapsed = performance.now() - started

    expect(elapsed).toBeLessThan(250)
    expect(Object.keys(references)).toHaveLength(0)
  })

  it("keeps numbered two-column entries separate and never treats a year as a key", () => {
    const entries = Array.from(
      { length: 40 },
      (_, index) =>
        `[${index + 1}] Author ${index + 1}. 2017. Paper ${index + 1} with a stable title. Venue.`,
    ).join(" ")

    const references = extractReferencesFromText(`References ${entries}`)

    expect(Object.keys(references)).toHaveLength(40)
    expect(references["40"]?.year).toBe(2017)
    expect(references["2017"]).toBeUndefined()
  })

  it("keeps trailing figure captions out of a year-at-end reference", () => {
    const references = extractReferencesFromText(
      "References [1] Author One and Author Two. A stable paper title. Journal, 2013. 12 Figure 3: unrelated caption text.",
    )

    expect(references["1"]).toMatchObject({
      title: "A stable paper title",
      year: 2013,
    })
    expect(references["1"]?.title).not.toContain("Figure")
  })

  it("keeps initials in author names out of the title boundary", () => {
    const references = extractReferencesFromText(
      "References [3] Quoc V. Le. Massive exploration of neural machine translation architectures. CoRR, 2017. [9] Yann N. Dauphin. Convolutional sequence to sequence learning. arXiv, 2017. [19] Alexander M. Rush. Structured attention networks. ICLR, 2017.",
    )

    expect(references["3"]?.title).toBe(
      "Massive exploration of neural machine translation architectures",
    )
    expect(references["9"]?.title).toBe("Convolutional sequence to sequence learning")
    expect(references["19"]?.title).toBe("Structured attention networks")
  })

  it("leaves an unresolved citation without fabricated paper metadata", () => {
    const structures = detectPageStructures(4, [
      {
        text: "Prior work [38].",
        bounds: { x: 10, y: 10, width: 200, height: 20 },
      },
    ])

    const citation = structures.find((structure) => structure.kind === "citation")
    expect(citation).toBeDefined()
    expect(citation?.reference).toBeUndefined()
  })
})
