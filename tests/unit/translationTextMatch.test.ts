import { describe, expect, it } from "vitest"
import {
  anchoredRangeOfOwners,
  canonicalText,
  coveredBlocks,
  plainSource,
  quoteCoversText,
  rangeOfOwners,
  textOwners,
  textRangeIn,
  textWithin,
} from "../../src/renderer/lib/translationTextMatch"

const blocks = [
  {
    id: "b1",
    source: "Critical illness is characterized by organ dysfunction.",
    translation: "중증 질환은 장기 기능 부전으로 특징지어진다.",
  },
  {
    id: "b2",
    source: "Critically ill patients are cared for in ICUs ([1](https://example.org/1)).",
    translation: "중증 환자는 중환자실(ICU)에서 치료받는다 ([1](https://example.org/1)).",
  },
  {
    id: "b3",
    source: "Circulatory failure is common.",
    translation: "순환 부전은 흔하다.",
  },
] as const

describe("canonical text", () => {
  it("keeps letters and digits and drops link targets", () => {
    expect(canonicalText("ICUs ([1](https://example.org/1)).")).toBe("icus1")
    expect(plainSource("cared  for in ICUs ([1](https://example.org/1)).")).toBe(
      "cared for in ICUs (1).",
    )
  })
})

describe("blocks a selection covers", () => {
  it("picks the sentences whose translation the selected words lie in", () => {
    expect(coveredBlocks(blocks, "환자는 중환자실(ICU)").map((block) => block.id)).toEqual(["b2"])
    expect(coveredBlocks(blocks, "특징지어진다. 중증 환자는").map((block) => block.id)).toEqual([
      "b1",
      "b2",
    ])
  })

  it("reads a selection of the source column too", () => {
    expect(coveredBlocks(blocks, "failure is").map((block) => block.id)).toEqual(["b3"])
  })

  it("falls back to every sentence of the article when the words cannot be placed", () => {
    expect(coveredBlocks(blocks, "x^{2}").map((block) => block.id)).toEqual(["b1", "b2", "b3"])
  })
})

describe("a highlight's quote against a sentence", () => {
  it("covers a sentence it contains, one it lies within, and one it starts or ends inside", () => {
    expect(
      quoteCoversText("organ dysfunction. Critically ill patients are", blocks[1].source),
    ).toBe(true)
    expect(
      quoteCoversText("organ dysfunction. Critically ill patients are", blocks[0].source),
    ).toBe(true)
    expect(quoteCoversText("cared for in ICUs", blocks[1].source)).toBe(true)
    expect(quoteCoversText(blocks[1].source, blocks[1].source)).toBe(true)
  })

  it("does not cover a sentence that only shares a few letters", () => {
    expect(
      quoteCoversText("organ dysfunction. Critically ill patients are", blocks[2].source),
    ).toBe(false)
    expect(quoteCoversText("is", blocks[0].source)).toBe(false)
  })
})

describe("text ranges", () => {
  it("finds the rendered words of a sentence across element boundaries", () => {
    const root = document.createElement("p")
    root.innerHTML =
      "중증 <strong>환자는</strong> 중환자실(<em>ICU</em>)에서 치료받는다 (<a href='https://example.org/1'>1</a>)."
    const range = textRangeIn(root, canonicalText(blocks[1].translation))
    expect(range?.toString()).toBe("중증 환자는 중환자실(ICU)에서 치료받는다 (1")
    expect(textRangeIn(root, canonicalText("없는 문장"))).toBeNull()
  })

  it("scopes a range to the part inside one element", () => {
    const root = document.createElement("div")
    root.innerHTML = "<p id='a'>first part</p><p id='b'>second part</p>"
    const a = root.querySelector("#a")
    const b = root.querySelector("#b")
    if (!a?.firstChild || !b?.firstChild) throw new Error("fixture")
    const range = document.createRange()
    range.setStart(a.firstChild, 6)
    range.setEnd(b.firstChild, 6)
    expect(textWithin(range, a)).toBe("part")
    expect(textWithin(range, b)).toBe("second")
  })
})

describe("anchored ranges", () => {
  function ownersOf(html: string) {
    const root = document.createElement("div")
    root.innerHTML = html
    return { root, owners: textOwners([root]) }
  }

  it("spans from a sentence's opening letters to its closing ones when its middle differs", () => {
    const { owners } = ownersOf(
      "<span>Values were imputed for all variables </span><span>within (m</span><span>i</span><span>, iqr</span><span>i</span><span>) of the first measurement, as in </span><span>Table 4.</span>",
    )
    const needle = canonicalText(
      "Values were imputed for all variables within $(\\mathrm{m}_i, \\mathrm{iqr}_i)$ of the first measurement, as in Table 4.",
    )
    expect(rangeOfOwners(owners, needle)).toBeNull()
    expect(anchoredRangeOfOwners(owners, needle)?.toString()).toBe(
      "Values were imputed for all variables within (mi, iqri) of the first measurement, as in Table 4",
    )
  })

  it("sizes the range by the sentence when only its opening is found", () => {
    const { owners } = ownersOf(
      "<span>Values were imputed for all variables within reach and beyond.</span>",
    )
    const needle = canonicalText("Values were imputed for all variables within XYZ")
    expect(anchoredRangeOfOwners(owners, needle)?.toString()).toBe(
      "Values were imputed for all variables within rea",
    )
    expect(
      anchoredRangeOfOwners(owners, canonicalText("nothing of this appears anywhere")),
    ).toBeNull()
  })
})
