import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { MarkdownContent } from "../../src/renderer/components/MarkdownContent"
import { parseCitationHref } from "../../src/renderer/lib/chatCitations"
import { spansCoveringQuote } from "../../src/renderer/lib/sourceQuoteFlash"

describe("chat source citations", () => {
  it("turns a citation marker into a chip that carries its verbatim phrase", async () => {
    const onCitation = vi.fn()
    render(
      <MarkdownContent
        source="변수는 7,333개입니다 [[p.2 | a total of 7,333 routinely collected (physiological) variables]]."
        onCitation={onCitation}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "p.2" }))

    expect(onCitation).toHaveBeenCalledWith({
      page: 2,
      quote: "a total of 7,333 routinely collected (physiological) variables",
    })
  })

  it("keeps Markdown emphasis intact around Korean page mentions", () => {
    const { container } = render(
      <MarkdownContent
        source="표는 **3페이지**에 있고 Methods는 11~14페이지입니다."
        onCitation={vi.fn()}
      />,
    )

    expect(container.querySelector("strong button")?.textContent).toBe("3페이지")
    expect(screen.getByRole("button", { name: "11~14페이지" })).toBeVisible()
    expect(container.textContent).not.toContain("**")
  })

  it("leaves code, math, URLs and existing links untouched", () => {
    const { container } = render(
      <MarkdownContent
        source={
          "Page 2 and p. 7, not `p.5`, not $p.9$, not https://example.com/p.3, not [p.4](https://example.com)."
        }
        onCitation={vi.fn()}
      />,
    )

    const chips = [...container.querySelectorAll("button")].map((button) => button.textContent)
    expect(chips).toEqual(["Page 2", "p. 7"])
  })

  it("renders page mentions as plain text when no handler is given", () => {
    render(<MarkdownContent source="See Page 2 [[p.2 | quote]]" />)

    expect(screen.queryByRole("button")).toBeNull()
  })

  it("rejects hrefs that are not page citations", () => {
    expect(parseCitationHref("#page-0")).toBeNull()
    expect(parseCitationHref("https://example.com")).toBeNull()
    expect(parseCitationHref("#page-4")).toEqual({ page: 4 })
  })

  it("finds the text-layer spans that cover a quote across span boundaries", () => {
    const spans = [
      "The full dataset con",
      "tained a total of 7,333 ",
      "routinely collected",
      " physi-",
      "ological variables",
    ].map((text) => {
      const span = document.createElement("span")
      span.textContent = text
      return span
    })

    const matched = spansCoveringQuote(spans, "a total of 7,333 routinely collected physiological")

    expect(matched.map((span) => span.textContent)).toEqual([
      "tained a total of 7,333 ",
      "routinely collected",
      " physi-",
      "ological variables",
    ])
    expect(spansCoveringQuote(spans, "not on this page at all")).toEqual([])
  })
})
