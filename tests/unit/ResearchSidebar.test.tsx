import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ResearchSidebar } from "../../src/renderer/components/ResearchSidebar"
import type { AiRequest } from "../../src/shared/ipc"
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

function SidebarHarness({ expanded = false }: { readonly expanded?: boolean }) {
  const [open, setOpen] = useState(expanded)
  return (
    <ResearchSidebar
      document={null}
      currentPage={1}
      cards={[]}
      citations={[]}
      expanded={open}
      provider={{ configured: false, provider: "openai", model: "gpt-5" }}
      onToggle={() => setOpen((current) => !current)}
      onJumpToCard={vi.fn()}
      onCardsChange={vi.fn()}
      onAiRequest={vi.fn(async () => "answer")}
    />
  )
}

describe("ResearchSidebar", () => {
  it("pins via the rail pin button and retains the panel after pointer leave", async () => {
    // Given: a collapsed sidebar opened once.
    render(<SidebarHarness />)
    await userEvent.click(screen.getByRole("button", { name: "연구 사이드바 펼치기" }))
    const sidebar = screen.getByLabelText("연구 사이드바")
    const mode = screen.getByRole("button", { name: "AI 개요 열기" })
    expect(sidebar).toHaveAttribute("data-flyout", "open")
    // When: the pin button at the top of the rail is clicked, then the pointer leaves.
    await userEvent.click(screen.getByRole("button", { name: "연구 사이드바 고정" }))
    fireEvent.pointerLeave(sidebar)
    // Then: the panel stays pinned, independently of hover or focus.
    expect(sidebar).toHaveAttribute("data-flyout", "pinned")
    expect(mode).toHaveAttribute("aria-expanded", "true")
    expect(mode).toHaveAttribute("aria-description", "고정됨")
  })

  it("unpins when the rail pin button is clicked again", async () => {
    // Given: a rail expanded by the saved workspace setting.
    render(<SidebarHarness expanded />)
    const sidebar = screen.getByLabelText("연구 사이드바")
    const mode = screen.getByRole("button", { name: "AI 개요 열기" })
    // When: the pin button is clicked once, then the pointer leaves.
    await userEvent.click(screen.getByRole("button", { name: "연구 사이드바 고정" }))
    expect(sidebar).toHaveAttribute("data-flyout", "pinned")
    fireEvent.pointerLeave(sidebar)
    expect(sidebar).toHaveAttribute("data-flyout", "pinned")
    // And: the pin button is clicked again to unpin.
    await userEvent.click(screen.getByRole("button", { name: "연구 사이드바 고정 해제" }))
    expect(sidebar).toHaveAttribute("data-flyout", "hover")
    fireEvent.pointerLeave(sidebar)
    // Then: the panel closes rather than staying pinned.
    expect(sidebar).toHaveAttribute("data-flyout", "hover")
    expect(mode).toHaveAttribute("aria-expanded", "false")
  })

  it("resets pinning on explicit collapse and opens the next mode transiently", async () => {
    // Given: a pinned sidebar.
    render(<SidebarHarness />)
    await userEvent.click(screen.getByRole("button", { name: "연구 사이드바 펼치기" }))
    await userEvent.click(screen.getByRole("button", { name: "연구 사이드바 고정" }))
    // When: explicitly collapsed and reopened with another mode.
    await userEvent.click(screen.getByRole("button", { name: "연구 사이드바 접기" }))
    expect(screen.queryByLabelText("연구 사이드바")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "연구 사이드바 펼치기" }))
    await userEvent.click(screen.getByRole("button", { name: "카드 모드" }))
    // Then: the new mode opens transiently and closes on pointer leave.
    const sidebar = screen.getByLabelText("연구 사이드바")
    expect(sidebar).toHaveAttribute("data-flyout", "open")
    fireEvent.pointerLeave(sidebar)
    expect(sidebar).toHaveAttribute("data-flyout", "hover")
  })

  it("gathers every board card in one mode and other papers in another", async () => {
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { onDocumentPageParseProgress: () => () => undefined },
    })
    render(
      <>
        <div className="board-world" />
        <div className="reader-workspace" />
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
        />
      </>,
    )

    expect(screen.getByRole("region", { name: "AI 논문 개요" })).toBeInTheDocument()
    const rail = screen.getByRole("navigation", { name: "연구 사이드바 모드" })
    expect(
      within(rail)
        .getAllByRole("button")
        .map((button) => button.getAttribute("data-research-mode"))
        .filter(Boolean),
    ).toEqual(["ai", "cards", "papers"])
    for (const old of ["번역", "AI 설명", "AI 카드", "메모", "포스트잇", "하이라이트", "인용"]) {
      expect(screen.queryByRole("button", { name: `${old} 모드` })).not.toBeInTheDocument()
    }

    await userEvent.click(screen.getByRole("button", { name: "카드 모드" }))
    expect(
      screen.getByRole("button", { name: "카드 모드" }).querySelector(".mode-count"),
    ).toBeNull()
    // Choosing the cards no longer opens a page translation; each page has its own button.
    expect(screen.queryByRole("region", { name: "페이지 번역" })).not.toBeInTheDocument()
    const allCards = screen.getByRole("region", { name: "카드 인덱스" })
    expect(
      within(allCards)
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-kind")),
    ).toEqual(["translation", "explanation"])
    const filters = screen.getByRole("group", { name: "카드 종류" })
    expect(
      within(filters)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["전체2", "번역1", "설명1"])

    await userEvent.click(within(filters).getByRole("button", { name: /설명/u }))
    expect(screen.getByRole("region", { name: "설명 인덱스" })).toBeInTheDocument()
    expect(
      within(screen.getByRole("button", { name: /Abstract 해설, p\.2/u })).getByText("Abstract", {
        selector: ".board-index-title",
      }),
    ).toBeVisible()
    expect(screen.queryByText("검증 가능한 번역")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "관련 논문 모드" }))
    expect(screen.getByRole("region", { name: "인용 논문 판독" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "찾기" }))
    expect(screen.getByRole("region", { name: "관련 논문 탐색" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "인용 논문 판독" })).not.toBeInTheDocument()

    // Each mode keeps its choice when the reader comes back to it.
    await userEvent.click(screen.getByRole("button", { name: "카드 모드" }))
    expect(screen.getByRole("region", { name: "설명 인덱스" })).toBeInTheDocument()
  })

  it("keeps highlights manual without mounting automatic generation", async () => {
    render(
      <ResearchSidebar
        document={documentFixture}
        currentPage={1}
        cards={[]}
        citations={[]}
        expanded
        provider={{ configured: true, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        onToggle={vi.fn()}
        onJumpToCard={vi.fn()}
        onCardsChange={vi.fn()}
        onAiRequest={vi.fn(async () => "answer")}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "카드 모드" }))

    expect(screen.getByRole("region", { name: "카드 인덱스" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "자동 하이라이트 실행" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Jev로 후보 선택" })).not.toBeInTheDocument()
  })

  it("starts overview generation when the document is ready", async () => {
    const onAiRequest = vi.fn(async (_request: Omit<AiRequest, "documentId">) => "cached result")
    render(
      <ResearchSidebar
        document={documentFixture}
        documentReady
        currentPage={1}
        cards={[]}
        citations={[]}
        expanded
        provider={{ configured: true, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        onToggle={vi.fn()}
        onJumpToCard={vi.fn()}
        onCardsChange={vi.fn()}
        onAiRequest={onAiRequest}
      />,
    )

    await waitFor(() => expect(onAiRequest).toHaveBeenCalledTimes(3))
    expect(onAiRequest.mock.calls.map(([request]) => request.action)).toEqual(
      expect.arrayContaining(["keywords", "three_line_summary", "paper_summary"]),
    )
  })
})
