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

  it("collects every numbered list of a Nature-style paper and stops at the back matter", () => {
    const references = extractReferencesFromText(
      [
        "Online content Any methods, additional references and statements are available online.",
        "References 1. Ehrenfeld, J. M. & Cannesson, M. (eds) Monitoring Technologies in Acute Care Environments (Springer Science & Business Media, 2013).",
        "7. Wallace, D. J., Angus, D. C. & Kahn, J. M. Nighttime intensivist staffing and mortality among critically ill patients. N. Engl. J. Med. 366 , 2093–2101 (2012). quiz 35.",
        "18. Dietterich, T. G. in Joint IAPR International Workshops on Statistical Techniques in Pattern Recognition vol. 2396 15–30 (Springer, 2002).",
        "Publisher’s note Springer Nature remains neutral with regard to jurisdictional claims.",
        "Methods Study design and setting. Patients admitted before 2008 were excluded from the analysis due to frequent changes in variable identifiers.",
        "References 59. Ye, L. & Keogh, E. in Proceedings of the 15th ACM SIGKDD International Conference on Knowledge Discovery and Data Mining 947–956 (ACM, 2009).",
        "60. Bock, C. et al. Association mapping in biomedical time series via statistically significant shapelet mining. Bioinformatics 34 , i438–i446 (2018).",
        "a cknowledgements Funding for this work was provided by the Swiss National Science Foundation. S.L.H. and T.G. with input from all authors created Fig. 1. Competing interests The authors declare no competing interests.",
        "Extended Data Fig. 1 | Example patient stay. Data from 2008 were excluded from the analysis due to frequent changes in variable identifiers.",
      ].join(" "),
    )

    expect(Object.keys(references).sort()).toEqual(["1", "18", "59", "60", "7"])
    expect(references["1"]).toMatchObject({
      authors: "Ehrenfeld, J. M. & Cannesson, M",
      title: "Monitoring Technologies in Acute Care Environments",
      year: 2013,
    })
    expect(references["7"]).toMatchObject({
      authors: "Wallace, D. J., Angus, D. C. & Kahn, J. M",
      title: "Nighttime intensivist staffing and mortality among critically ill patients",
      venue: "N. Engl. J. Med. 366 , 2093–2101",
      year: 2012,
    })
    expect(references["18"]).toMatchObject({
      authors: "Dietterich, T. G",
      title: "Joint IAPR International Workshops on Statistical Techniques in Pattern Recognition",
      year: 2002,
    })
    expect(references["59"]).toMatchObject({
      authors: "Ye, L. & Keogh, E",
      title:
        "Proceedings of the 15th ACM SIGKDD International Conference on Knowledge Discovery and Data Mining",
      year: 2009,
    })
    expect(references["60"]).toMatchObject({ authors: "Bock, C. et al", year: 2018 })
    expect(references["60"]?.title).toBe(
      "Association mapping in biomedical time series via statistically significant shapelet mining",
    )
  })

  it("keeps every numbered entry shorter than a page of prose", () => {
    const prose = "This sentence is prose that follows the final reference of the list. ".repeat(40)
    const references = extractReferencesFromText(
      `References 1. Author, A. A stable paper title. Journal 1 , 1–2 (2019). ${prose}`,
    )

    expect(references["1"]?.rawText.length).toBeLessThan(1_000)
    expect(references["1"]?.authors.length).toBeLessThan(200)
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
