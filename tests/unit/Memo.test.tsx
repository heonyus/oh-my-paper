import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Memo } from "../../src/renderer/components/Memo"
import { renderMemoPreview } from "../../src/renderer/components/memoPreview"

function renderMemo(markdown: string, autoFocus = false) {
  return render(
    <Memo
      markdown={markdown}
      onChange={vi.fn()}
      placeholder="메모"
      ariaLabel="메모 내용"
      autoFocus={autoFocus}
    />,
  )
}

function memo(): HTMLElement {
  return screen.getByRole("textbox", { name: "메모 내용" })
}

describe("memo preview", () => {
  it("typesets formulas and keeps an empty line's height, as the editor does", () => {
    const host = document.createElement("div")
    host.append(renderMemoPreview("에너지 $E=mc^2$\n\n- 하나", "메모") ?? "")

    const formula = host.querySelector<HTMLElement>("span[data-math]")
    expect(formula?.querySelector(".katex")).not.toBeNull()
    expect(formula?.title).toBe("$E=mc^2$")
    expect(host.querySelector("li")).toHaveTextContent("하나")
    expect(host.querySelector("p.is-empty")).toBeNull()
  })

  it("shows the placeholder on an empty memo", () => {
    const host = document.createElement("div")
    host.append(renderMemoPreview("", "메모") ?? "")

    const line = host.querySelector("p")
    expect(line).toHaveClass("is-empty")
    expect(line).toHaveAttribute("data-placeholder", "메모")
    expect(line?.querySelector("br")).not.toBeNull()
  })
})

describe("Memo", () => {
  it("is the editor from the start when opened to be written", () => {
    renderMemo("", true)
    expect(memo()).toHaveAttribute("contenteditable", "true")
  })

  it("draws a memo changed from outside without an editor", () => {
    const view = renderMemo("처음")
    view.rerender(
      <Memo markdown="**바뀜**" onChange={vi.fn()} placeholder="메모" ariaLabel="메모 내용" />,
    )
    expect(screen.getByText("바뀜").tagName).toBe("STRONG")
    expect(memo()).not.toHaveAttribute("contenteditable")
  })

  it("becomes the editor when reached with the keyboard", () => {
    renderMemo("읽기만 하던 메모")
    fireEvent.focus(memo())
    expect(memo()).toHaveAttribute("contenteditable", "true")
    expect(memo()).toHaveTextContent("읽기만 하던 메모")
  })

  it("waits for the click when focus comes from a press, and stays put while text is selected", () => {
    renderMemo("복사할 문장")
    const preview = memo()
    fireEvent.pointerDown(preview)
    fireEvent.focus(preview)
    expect(memo()).not.toHaveAttribute("contenteditable")

    const text = screen.getByText("복사할 문장").firstChild
    if (!text) throw new Error("memo text must be drawn")
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 3)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.click(preview)
    expect(memo()).not.toHaveAttribute("contenteditable")

    window.getSelection()?.removeAllRanges()
    fireEvent.click(preview)
    expect(memo()).toHaveAttribute("contenteditable", "true")
  })

  it("does not follow a link in a memo that is clicked", () => {
    renderMemo("[논문](https://arxiv.org/abs/1706.03762)")
    const link = screen.getByText("논문")
    expect(link.closest("a")).toHaveAttribute("href", "https://arxiv.org/abs/1706.03762")

    expect(fireEvent.click(link)).toBe(false)
    expect(memo()).toHaveAttribute("contenteditable", "true")
  })
})
