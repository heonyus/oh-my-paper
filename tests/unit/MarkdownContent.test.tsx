import { readFileSync } from "node:fs"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MarkdownContent } from "../../src/renderer/components/MarkdownContent"

describe("MarkdownContent", () => {
  it("renders Markdown and display LaTeX from one source string", () => {
    const { container } = render(<MarkdownContent source={"**핵심**\n\n$$E = mc^2$$"} />)

    expect(screen.getByText("핵심").tagName).toBe("STRONG")
    expect(container.querySelector(".katex-display")).not.toBeNull()
  })

  it("normalizes TeX delimiters emitted by OCR into rendered math", () => {
    const { container } = render(<MarkdownContent source={String.raw`Distance \(d_k\)`} />)

    expect(container.querySelector(".katex")).not.toBeNull()
  })

  it("sets bracketed citation markers as superscripts only when asked", () => {
    const source = "어려워지고 있다[1]. 위험을 증가시킨다[4,5–7]."
    const plain = render(<MarkdownContent source={source} />)
    expect(plain.container.querySelector("sup")).toBeNull()
    expect(plain.container.textContent).toContain("[1]")
    plain.unmount()

    const { container } = render(<MarkdownContent source={source} citationMarkers />)
    const markers = [...container.querySelectorAll("sup.citation-marker")]
    expect(markers.map((marker) => marker.textContent)).toEqual(["1", "4,5–7"])
    expect(container.textContent).toBe("어려워지고 있다1. 위험을 증가시킨다4,5–7.")
  })

  it("leaves bracketed numbers inside code and links alone", () => {
    const { container } = render(
      <MarkdownContent source={"`a[1]` and [1](https://example.com)"} citationMarkers />,
    )
    expect(container.querySelector("sup")).toBeNull()
  })

  it("sets a superscript in the size classes the loaded KaTeX stylesheet knows", () => {
    // The renderer's KaTeX and the stylesheet's must be one version: a newer stylesheet styles
    // `.katex-sizing` while an older renderer emits `.sizing`, and an exponent is then set at
    // full size on its own line.
    const { container } = render(<MarkdownContent source="넓이는 $x^2$" />)
    const exponent = container.querySelector(".katex .msupsub .mord.mtight")
    expect(exponent).not.toBeNull()
    const sizingClass = [...(exponent?.parentElement?.classList ?? [])].find((name) =>
      /sizing/u.test(name),
    )
    expect(sizingClass).toBeDefined()
    const stylesheet = readFileSync(require.resolve("katex/dist/katex.min.css"), "utf8")
    expect(stylesheet).toContain(`.katex .${sizingClass}.reset-size6.size3`)
  })
})
