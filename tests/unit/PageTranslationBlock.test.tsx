import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PageTranslationBlock } from "../../src/renderer/components/PageTranslationBlock"
import type { PageTranslationBlock as Block } from "../../src/renderer/lib/pageTranslationSource"

const untranslated: Block = {
  id: "page:1:block:0",
  kind: "body",
  source: "Source paragraph.",
  translation: "",
}

describe("PageTranslationBlock", () => {
  it("keeps an untranslated paragraph empty instead of showing a placeholder", () => {
    render(<PageTranslationBlock block={untranslated} page={1} startsGroup mode="bilingual" />)
    expect(screen.getByText("Source paragraph.")).toBeTruthy()
    expect(screen.queryByText(/번역되지 않았습니다/u)).toBeNull()
    expect(document.querySelector(".page-translation-result")).toBeNull()
  })

  it("renders the translation once text arrives", () => {
    render(
      <PageTranslationBlock
        block={{ ...untranslated, translation: "번역 문단입니다." }}
        page={1}
        startsGroup
        mode="bilingual"
      />,
    )
    expect(screen.getByText("번역 문단입니다.")).toBeTruthy()
  })
})
