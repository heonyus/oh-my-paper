import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ResearchSidebar } from "../../src/renderer/components/ResearchSidebar"
import { boardCardSchema, documentRecordSchema } from "../../src/shared/schemas"

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

const cards = [
  boardCardSchema.parse({
    id: "42ad8d84-c1ee-45b4-a022-6cf0d4c14278",
    documentId: documentFixture.id,
    kind: "translation",
    title: "선택 번역",
    body: "검증 가능한 번역",
    x: 800,
    y: 240,
    minimized: false,
    anchor: {
      page: 1,
      quote: "source",
      x: 420,
      y: 180,
      fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
    },
  }),
  boardCardSchema.parse({
    id: "63b52673-19ca-4b24-9680-4d3e7615887c",
    documentId: documentFixture.id,
    kind: "explanation",
    title: "Abstract 해설",
    body: "근거 기반 설명",
    x: 900,
    y: 320,
    minimized: false,
    anchor: {
      page: 2,
      quote: "Abstract",
      x: 520,
      y: 260,
      fragments: [{ x: 520, y: 260, width: 90, height: 18 }],
    },
  }),
]

describe("ResearchSidebar", () => {
  it("exposes each board-card category as its own sidebar mode", async () => {
    render(
      <ResearchSidebar
        document={documentFixture}
        currentPage={1}
        cards={cards}
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
    expect(screen.queryByRole("button", { name: "보드 모드" })).not.toBeInTheDocument()
    expect(screen.queryByRole("toolbar", { name: "보드 카드 필터" })).not.toBeInTheDocument()
    for (const label of ["번역", "AI 설명", "AI 카드", "노트", "포스트잇", "하이라이트"]) {
      expect(screen.getByRole("button", { name: `${label} 모드` })).toBeVisible()
    }
    await userEvent.click(screen.getByRole("button", { name: "번역 모드" }))
    expect(screen.getByRole("region", { name: "번역 인덱스" })).toBeInTheDocument()
    expect(screen.getByText("선택 번역")).toBeVisible()
    expect(screen.queryByText("Abstract 해설")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "AI 설명 모드" }))
    expect(screen.getByRole("button", { name: "AI 설명 모드" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "번역 모드" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    expect(screen.getByRole("region", { name: "AI 설명 인덱스" })).toBeInTheDocument()
    expect(
      within(screen.getByRole("button", { name: /Abstract 해설, p\.2/u })).getByText("Abstract", {
        selector: ".board-index-title",
      }),
    ).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "인용 모드" }))
    expect(screen.getByRole("region", { name: "인용 논문 판독" })).toBeInTheDocument()
  })
})
