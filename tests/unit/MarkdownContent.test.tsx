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
})
