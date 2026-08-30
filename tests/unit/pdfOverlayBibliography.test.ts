import { describe, expect, it } from "vitest"
import { enrichOverlayCitations } from "../../src/renderer/lib/pdfOverlayBibliography"

describe("enrichOverlayCitations", () => {
  it("replaces an early author-year placeholder with the parsed bibliography entry", () => {
    const pageDiv = document.createElement("div")
    const enriched = enrichOverlayCitations(
      {
        2: {
          pageDiv,
          pageWidth: 800,
          pageHeight: 1100,
          structures: [
            {
              id: "citation-2-deepmind",
              kind: "citation",
              page: 2,
              title: "DeepMind, 2025",
              quote: "DeepMind, 2025",
              bounds: { x: 300, y: 240, width: 100, height: 20 },
              reference: {
                key: "deepmind-2025",
                title: "인용 논문 제목을 확인하는 중",
                authors: "DeepMind",
                year: 2025,
                venue: "",
                rawText: "DeepMind, 2025",
              },
            },
          ],
        },
      },
      {
        "deepmind-2025": {
          key: "deepmind-2025",
          title: "Alphaevolve: A coding agent for scientific and algorithmic discovery",
          authors: "Google DeepMind",
          year: 2025,
          venue: "Google DeepMind Blog",
          rawText:
            "Google DeepMind. Alphaevolve: A coding agent for scientific and algorithmic discovery. Google DeepMind Blog, 2025.",
        },
      },
    )

    expect(enriched[2]?.structures[0]?.reference?.title).toBe(
      "Alphaevolve: A coding agent for scientific and algorithmic discovery",
    )
  })

  it("preserves author-year suffixes when joining an inline citation to its bibliography", () => {
    const pageDiv = document.createElement("div")
    const enriched = enrichOverlayCitations(
      {
        2: {
          pageDiv,
          pageWidth: 800,
          pageHeight: 1100,
          structures: [
            {
              id: "citation-2-tang",
              kind: "citation",
              page: 2,
              title: "Tang et al., 2024a",
              quote: "BioCoder (Tang et al., 2024a) assesses code generation.",
              bounds: { x: 300, y: 240, width: 100, height: 20 },
            },
          ],
        },
      },
      {
        "tang-2024a": {
          key: "tang-2024a",
          title: "BioCoder: A benchmark for bioinformatics code generation",
          authors: "Xiangru Tang et al.",
          year: 2024,
          venue: "Bioinformatics",
          rawText: "Xiangru Tang et al. BioCoder. Bioinformatics, 2024a.",
        },
      },
    )

    expect(enriched[2]?.structures[0]?.reference?.key).toBe("tang-2024a")
    expect(enriched[2]?.structures[0]?.reference?.title).toContain("BioCoder")
  })
})
