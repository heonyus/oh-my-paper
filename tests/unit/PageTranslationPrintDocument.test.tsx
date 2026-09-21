import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  PageTranslationPrintDocument,
  printableDocumentTitle,
} from "../../src/renderer/components/PageTranslationPrintDocument"
import type { PageTranslationBlock } from "../../src/renderer/lib/pageTranslationSource"

const translatedBlock: PageTranslationBlock = {
  id: "page:1:block:0",
  kind: "body",
  source: "Source paragraph.",
  translation: "번역 문단입니다.",
}

describe("PageTranslationPrintDocument", () => {
  it("uses the first translated heading instead of a timestamp upload title", () => {
    expect(
      printableDocumentTitle("1789887714469-Attention-Is-All-You-Need", {
        1: [
          translatedBlock,
          {
            ...translatedBlock,
            id: "page:1:block:1",
            kind: "heading",
            source: "# Attention Is All You Need",
          },
        ],
      }),
    ).toBe("Attention Is All You Need")
  })

  it("renders every translated page with the original page beside Korean in parallel mode", () => {
    render(
      <PageTranslationPrintDocument
        documentTitle="Test Paper"
        mode="parallel"
        pages={{ 1: [translatedBlock], 2: [{ ...translatedBlock, id: "page:2:block:0" }] }}
        pageImages={{ 1: "data:image/png;base64,first", 2: "data:image/png;base64,second" }}
      />,
    )

    expect(screen.getByLabelText("전체 번역 PDF 출력")).toHaveAttribute("data-mode", "parallel")
    expect(screen.getAllByRole("article", { name: /번역 페이지/u })).toHaveLength(2)
    expect(screen.getAllByRole("img", { name: /원본 PDF/u })).toHaveLength(2)
    expect(screen.getAllByText("번역 문단입니다.")).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "번역에서 원문 위치로 이동" })).toHaveLength(2)
  })
})
