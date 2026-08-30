import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MarkdownContent } from "../../src/renderer/components/MarkdownContent"

describe("MarkdownContent", () => {
  it("renders Markdown and display LaTeX from one source string", () => {
    const { container } = render(<MarkdownContent source={"**핵심**\n\n$$E = mc^2$$"} />)

    expect(screen.getByText("핵심").tagName).toBe("STRONG")
    expect(container.querySelector(".katex-display")).not.toBeNull()
  })
})
