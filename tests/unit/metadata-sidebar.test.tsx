import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { MetadataSidebar } from "../../src/renderer/components/MetadataSidebar"
import type { DocumentRecord } from "../../src/renderer/types"
import { boardCardSchema, documentRecordSchema } from "../../src/shared/schemas"

const fixture: DocumentRecord = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Sample Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-26T00:00:00.000Z",
  pageCount: 12,
  title: "Sample Paper",
  authors: ["Researcher"],
  year: 2026,
  doi: null,
  quality: { textCharacters: 2400, needsOcr: false, warnings: [] },
})

const translationCard = boardCardSchema.parse({
  id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
  documentId: fixture.id,
  kind: "translation",
  title: "페이지 번역",
  body: "능력을 갖추고 있는",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 3,
    quote: "empowered",
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

describe("MetadataSidebar", () => {
  it("renders document metadata when expanded", () => {
    render(
      <MetadataSidebar
        document={fixture}
        pageCount={12}
        currentPage={3}
        tags={["machine learning", "survey"]}
        cardCount={4}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole("complementary", { name: "메타정보 사이드바" })).toBeInTheDocument()
    expect(screen.getByText("Sample Paper")).toBeInTheDocument()
    expect(screen.getByText(/12페이지/)).toBeInTheDocument()
    expect(screen.getByText("현재 3페이지")).toBeInTheDocument()
    expect(screen.getByText("machine learning")).toBeInTheDocument()
    expect(screen.getByText(/연구 카드 4개/)).toBeInTheDocument()
  })

  it("renders collapsed marker rail and calls onToggle to expand", async () => {
    const onToggle = vi.fn()
    render(
      <MetadataSidebar
        document={null}
        pageCount={0}
        currentPage={0}
        tags={[]}
        cardCount={0}
        expanded={false}
        onToggle={onToggle}
      />,
    )

    const toggle = screen.getByRole("button", { name: "사이드바 펼치기" })
    await userEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole("complementary", { name: "메타정보 사이드바" }),
    ).not.toBeInTheDocument()
  })

  it("shows empty state message when no document is open", () => {
    render(
      <MetadataSidebar
        document={null}
        pageCount={0}
        currentPage={0}
        tags={[]}
        cardCount={0}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByText("열려 있는 문서가 없습니다")).toBeInTheDocument()
  })

  it("lists board artifacts and jumps directly to the selected card", async () => {
    const onJumpToCard = vi.fn()
    render(
      <MetadataSidebar
        document={fixture}
        pageCount={12}
        currentPage={3}
        tags={[]}
        cardCount={1}
        cards={[translationCard]}
        onToggle={vi.fn()}
        onJumpToCard={onJumpToCard}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /페이지 번역.*p\.3/u }))

    expect(screen.getByText("번역")).toBeInTheDocument()
    expect(onJumpToCard).toHaveBeenCalledWith(translationCard.id)
  })

  it("opens the AI agent from the sidebar header", async () => {
    const onOpenChat = vi.fn()
    render(
      <MetadataSidebar
        document={fixture}
        pageCount={12}
        currentPage={3}
        tags={[]}
        cardCount={0}
        onToggle={vi.fn()}
        onOpenChat={onOpenChat}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "AI 에이전트 열기" }))
    expect(onOpenChat).toHaveBeenCalledOnce()
  })
})
