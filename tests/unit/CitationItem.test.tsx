import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CitationItem } from "../../src/renderer/components/CitationItem"
import type { CitationIndexEntry } from "../../src/renderer/lib/pdfCitationIndex"

function entryWith(overrides: Partial<CitationIndexEntry>): CitationIndexEntry {
  return {
    key: "7",
    title: "Nighttime intensivist staffing and mortality among critically ill patients",
    authors: "Wallace, D. J.",
    year: 2012,
    venue: "N. Engl. J. Med.",
    rawText: "[7] Wallace, D. J. Nighttime intensivist staffing.",
    doi: null,
    contexts: [{ page: 2, text: "Staffing matters [7]." }],
    ...overrides,
  }
}

function renderItem(entry: CitationIndexEntry) {
  return render(
    <CitationItem
      entry={entry}
      state={undefined}
      ranked={undefined}
      onAnalyze={vi.fn()}
      onSave={vi.fn()}
      onAsk={vi.fn(async () => "")}
    />,
  )
}

describe("CitationItem", () => {
  it("collapses a long heading behind a 펼쳐보기 toggle", async () => {
    const authors = Array.from({ length: 24 }, (_, index) => `Author ${index + 1}, A. B.`).join(
      ", ",
    )
    renderItem(entryWith({ authors }))

    const toggle = screen.getByRole("button", { name: "펼쳐보기" })
    const heading = document.getElementById(toggle.getAttribute("aria-controls") ?? "")
    expect(heading).toHaveAttribute("data-clamped", "true")
    expect(heading).toHaveTextContent(`${authors} · 2012`)

    await userEvent.click(toggle)
    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true")
    expect(heading).toHaveAttribute("data-clamped", "false")
  })

  it("shows a short heading without a toggle", () => {
    renderItem(entryWith({}))

    expect(screen.queryByRole("button", { name: /펼쳐보기|접기/u })).toBeNull()
    expect(screen.getByText("Wallace, D. J. · 2012")).toBeVisible()
  })
})
