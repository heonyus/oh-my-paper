import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PaperStructureOverlay } from "../../src/renderer/components/PaperStructureOverlay"
import type { DetectedStructure } from "../../src/renderer/lib/structureDetector"

const citation: DetectedStructure = {
  id: "citation-12",
  kind: "citation",
  page: 2,
  title: "인용 논문 [12]",
  quote: "Prior work [12]",
  bounds: { x: 140, y: 200, width: 60, height: 18 },
  reference: {
    key: "12",
    title: "A Memory Retrieval Paper",
    authors: "Jane Doe",
    year: 2024,
    venue: "KDD",
    rawText: "[12] Jane Doe. A Memory Retrieval Paper.",
  },
}

describe("citation hover preview", () => {
  it("shows local metadata without creating a card until the user saves it", () => {
    const onTrigger = vi.fn()
    const { container } = render(
      <PaperStructureOverlay
        structures={[citation]}
        onTrigger={onTrigger}
        onCopy={vi.fn(async () => {})}
      />,
    )
    const region = container.querySelector<HTMLElement>(
      '.structure-hover-region[data-kind="citation"]',
    )
    if (!region) throw new Error("citation region must render")

    fireEvent.focus(screen.getByRole("button", { name: "인용 논문 [12] 인용 논문 미리보기 열기" }))

    expect(screen.queryByRole("button", { name: /인용 논문 보기/u })).not.toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: "인용 논문 미리보기" })).toBeVisible()
    expect(screen.getByText("A Memory Retrieval Paper")).toBeVisible()
    expect(onTrigger).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "인용 논문 카드를 보드에 저장" }))

    expect(onTrigger).toHaveBeenCalledOnce()
    expect(onTrigger).toHaveBeenCalledWith(citation)
  })
})
