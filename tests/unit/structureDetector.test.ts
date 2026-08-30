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
})
