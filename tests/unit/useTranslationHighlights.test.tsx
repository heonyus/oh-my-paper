import { render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PageTranslationBlock } from "../../src/renderer/components/PageTranslationBlock"
import type { PageTranslationBlock as Block } from "../../src/renderer/lib/pageTranslationSource"
import { paintTranslationHighlights } from "../../src/renderer/lib/useTranslationHighlights"

const blocks: readonly Block[] = [
  {
    id: "p1-b1",
    kind: "body",
    parsedBlockId: "page:1:block:1",
    source: "Critical illness is characterized by organ dysfunction.",
    translation: "중증 질환은 장기 기능 부전으로 특징지어진다.",
  },
  {
    id: "p1-b2",
    kind: "body",
    parsedBlockId: "page:1:block:1",
    source: "Critically ill patients are cared for in ICUs ([1](https://example.org/1)).",
    translation: "중증 환자는 **중환자실**에서 치료받는다.",
  },
]

describe("highlights echoed in the translation pane", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("marks a highlighted sentence's translation and its source column", () => {
    const first = blocks[0]
    if (!first) throw new Error("fixture")
    const { container } = render(
      <PageTranslationBlock block={first} page={1} startsGroup mode="bilingual" group={blocks} />,
    )

    const ranges = paintTranslationHighlights(container, blocks, [
      "Critically ill patients are cared for in ICUs (1).",
    ])

    expect(ranges.map((range) => range.toString())).toEqual([
      "Critically ill patients are cared for in ICUs (1",
      "중증 환자는 중환자실에서 치료받는다",
    ])
    // Without the highlight API the whole article carries the mark.
    expect(container.querySelector("article")).toHaveAttribute("data-highlighted", "true")
  })

  it("marks every sentence a highlight drawn on the page runs through, and clears the rest", () => {
    const first = blocks[0]
    if (!first) throw new Error("fixture")
    const { container } = render(
      <PageTranslationBlock block={first} page={1} startsGroup mode="parallel" />,
    )
    const article = container.querySelector("article")
    article?.setAttribute("data-highlighted", "true")

    const across = paintTranslationHighlights(container, blocks, [
      "organ dysfunction. Critically ill patients",
    ])
    expect(across.map((range) => range.toString())).toEqual([
      "중증 질환은 장기 기능 부전으로 특징지어진다",
    ])

    expect(paintTranslationHighlights(container, blocks, [])).toEqual([])
    expect(article).not.toHaveAttribute("data-highlighted")
  })
})
