import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { LibraryDocumentOverview } from "../../src/renderer/components/LibraryDocumentOverview"

describe("LibraryDocumentOverview", () => {
  it("collapses a long overview and expands it on demand", async () => {
    const overview = "Page 1: The learnware paradigm reuses well-trained models. ".repeat(20)
    render(<LibraryDocumentOverview overview={overview} />)

    const text = screen.getByText(overview.trim())
    const toggle = screen.getByRole("button", { name: "개요 전체 내용 펼치기" })
    expect(text).toHaveAttribute("data-clamped", "true")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAttribute("aria-controls", text.id)

    await userEvent.click(toggle)

    expect(text).toHaveAttribute("data-clamped", "false")
    expect(screen.getByRole("button", { name: "개요 접기" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
  })

  it("shows a short overview in full without a toggle", () => {
    render(<LibraryDocumentOverview overview="A short abstract." />)

    expect(screen.getByText("A short abstract.")).toHaveAttribute("data-clamped", "false")
    expect(screen.queryByRole("button")).toBeNull()
  })
})
