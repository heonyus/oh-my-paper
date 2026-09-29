import { describe, expect, it } from "vitest"
import { withoutPageFurniture } from "../../src/renderer/lib/pageFurniture"

const footer = (page: number) =>
  `Na T u RE M ED I C I NE | VOL 26 | M ARCH 2020 | 364–373 | www.nature.com/naturemedicine ${page}`

describe("withoutPageFurniture", () => {
  it("strips running headers and page-numbered footers that repeat across pages", () => {
    const pages = [
      `Articles https://doi.org/10.1038/example Abstract text. ${footer(364)}`,
      `Articles NaTurE MEDIcI N E Body of page two. ${footer(365)}`,
      `Articles NaTurE MEDIcI N E 16. Top 10 hazards. ECRI (2019); https://www.ecri.org ${footer(366)}`,
      "Articles NaTurE MEDIcI N E 17. Graham, K. C. Monitor alarm fatigue. Care 19 , 28 (2010).",
      "Articles NaTurE MEDIcI N E Articles NaTurE MEDIcI N E Extended Data Fig. 1 | Example stay.",
      "Articles NaTurE MEDIcI N E Articles NaTurE MEDIcI N E Extended Data Fig. 2 | Design.",
    ]

    const cleaned = withoutPageFurniture(pages)

    expect(cleaned[1]).toBe("Body of page two.")
    expect(cleaned[2]).toBe("16. Top 10 hazards. ECRI (2019); https://www.ecri.org")
    expect(cleaned[4]).toBe("Extended Data Fig. 1 | Example stay.")
    expect(cleaned[0]).toBe("Articles https://doi.org/10.1038/example Abstract text.")
  })

  it("leaves pages alone when nothing repeats", () => {
    const pages = ["Alpha beta gamma delta.", "Epsilon zeta eta theta.", "Iota kappa lambda mu."]

    expect(withoutPageFurniture(pages)).toEqual(pages)
  })
})
