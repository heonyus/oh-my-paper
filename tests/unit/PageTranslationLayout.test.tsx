import { fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PageTranslationLayout } from "../../src/renderer/components/PageTranslationLayout"
import type { LayoutRegion } from "../../src/renderer/lib/pageTranslationLayoutRegions"
import { documentIdSchema } from "../../src/shared/schemas"

const documentId = documentIdSchema.parse("aabbccddeeff0011")

const regions: readonly LayoutRegion[] = [
  {
    id: "page:2:block:4",
    blockIds: ["page:2:block:4:sentence:1", "page:2:block:4:sentence:2"],
    kind: "body",
    rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.15 },
    translation: "전체 데이터셋에는 **7,333개** 변수가 있었다.",
  },
  {
    id: "page:2:block:3",
    blockIds: ["page:2:block:3"],
    kind: "heading",
    rect: { x: 0.1, y: 0.15, width: 0.1, height: 0.02 },
    translation: "결과",
  },
  {
    id: "page:2:block:9",
    blockIds: ["page:2:block:9:sentence:1"],
    kind: "body",
    rect: { x: 0.55, y: 0.2, width: 0.35, height: 0.1 },
    translation: "",
  },
]

function sourcePage(): HTMLElement {
  const page = document.createElement("div")
  page.className = "page"
  page.setAttribute("data-page-number", "2")
  page.innerHTML = `<div class="textLayer">
      <span data-page-translation-block="page:2:block:4:sentence:1">The full dataset</span>
      <span data-page-translation-block="page:2:block:4:sentence:2">contained variables</span>
    </div>`
  Object.defineProperty(page, "offsetWidth", { value: 600 })
  for (const span of page.querySelectorAll<HTMLElement>("span")) span.style.fontSize = "9.6px"
  document.body.append(page)
  return page
}

describe("layout-preserving page translation", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("sets each translated paragraph in its source box and skips untranslated ones", () => {
    sourcePage()
    const { container } = render(
      <PageTranslationLayout documentId={documentId} page={2} regions={regions} />,
    )

    const placed = [...container.querySelectorAll<HTMLElement>(".page-translation-layout-region")]
    expect(placed.map((region) => region.getAttribute("data-region-id"))).toEqual([
      "page:2:block:4",
      "page:2:block:3",
    ])
    const [body, heading] = placed
    expect(body?.style.left).toBe("10%")
    expect(body?.style.top).toBe("20%")
    expect(body?.style.width).toBe("40%")
    expect(body?.style.height).toBe("15%")
    expect(body?.querySelector("strong")?.textContent).toBe("7,333개")
    expect(heading).toHaveAttribute("data-kind", "heading")
  })

  it("starts from the source text size, relative to the page width", () => {
    sourcePage()
    const { container } = render(
      <PageTranslationLayout documentId={documentId} page={2} regions={regions} />,
    )

    const [body, heading] = container.querySelectorAll<HTMLElement>(
      ".page-translation-layout-region",
    )
    expect(body?.style.getPropertyValue("--fit-font-size")).toBe("1.6")
    expect(heading?.style.getPropertyValue("--fit-font-size")).toBe("2")
  })

  it("lights up the source sentences while a translated box is hovered", () => {
    const page = sourcePage()
    const { container } = render(
      <PageTranslationLayout documentId={documentId} page={2} regions={regions} />,
    )
    const body = container.querySelector<HTMLElement>('[data-region-id="page:2:block:4"]')
    if (!body) throw new Error("region missing")

    fireEvent.mouseEnter(body)
    expect(page.querySelectorAll('[data-page-translation-active="true"]')).toHaveLength(2)
    fireEvent.mouseLeave(body)
    expect(page.querySelectorAll('[data-page-translation-active="true"]')).toHaveLength(0)
    expect(body).toHaveAttribute(
      "data-block-ids",
      "page:2:block:4:sentence:1 page:2:block:4:sentence:2",
    )
  })
})

describe("a display equation in the page layout", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("typesets the equation's LaTeX as math in its source box", () => {
    const { container } = render(
      <PageTranslationLayout
        documentId={documentId}
        page={2}
        regions={[
          {
            id: "equation:page:2:block:7",
            blockIds: ["page:2:block:7"],
            kind: "equation",
            rect: { x: 0.2, y: 0.4, width: 0.3, height: 0.05 },
            translation: "$$\n1. x=\\frac{a}{b} \\tag{3}\n$$",
          },
        ]}
      />,
    )

    const equation = container.querySelector<HTMLElement>('[data-kind="equation"]')
    expect(equation?.style.top).toBe("40%")
    expect(equation?.querySelector(".katex-display .mfrac")).not.toBeNull()
    expect(equation?.querySelector(".katex-error")).toBeNull()
    expect(equation?.style.getPropertyValue("--fit-font-size")).toBe("1.6")
  })
})
