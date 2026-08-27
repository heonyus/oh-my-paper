import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ResearchSidebar } from "../../src/renderer/components/ResearchSidebar"
import { documentRecordSchema } from "../../src/shared/schemas"

const documentFixture = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 12,
  title: "Paper",
  authors: ["Researcher"],
  year: 2026,
  doi: null,
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

describe("ResearchSidebar", () => {
  it("switches between the three confirmed modes", async () => {
    render(
      <ResearchSidebar
        document={documentFixture}
        currentPage={1}
        cards={[]}
        citations={[
          {
            key: "1",
            title: "Cited Paper",
            authors: "Jane Doe",
            year: 2024,
            venue: "KDD",
            rawText: "[1] Cited Paper",
            doi: null,
            contexts: [{ page: 2, text: "We follow [1]." }],
          },
        ]}
        expanded
        provider={{ configured: false, provider: "openai", model: "gpt-5" }}
        onToggle={vi.fn()}
        onJumpToCard={vi.fn()}
        onCardsChange={vi.fn()}
        onAiRequest={vi.fn(async () => "answer")}
      />,
    )

    expect(screen.getByRole("region", { name: "AI 논문 개요" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "보드 모드" }))
    expect(screen.getByRole("region", { name: "보드 인덱스" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "인용 모드" }))
    expect(screen.getByRole("region", { name: "인용 논문 판독" })).toBeInTheDocument()
  })
})
