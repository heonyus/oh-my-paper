import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BoardCard } from "../../src/renderer/components/BoardCard"
import { boardCardSchema } from "../../src/shared/schemas"

const card = boardCardSchema.parse({
  id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
  documentId: "aabbccddeeff0011",
  kind: "note",
  title: "주석",
  body: "테스트 메모",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 1,
    quote: "selected text",
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

const translationCard = boardCardSchema.parse({
  ...card,
  id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
  kind: "translation",
  title: "페이지 번역",
  body: "능력을 갖추고 있는",
})

const advancedControls = {
  onMinimize: vi.fn(),
  onResize: vi.fn(),
  onChatChange: vi.fn(),
  onAsk: vi.fn(async () => "answer"),
}

describe("BoardCard controls", () => {
  it("closes from the X button without starting a card drag", () => {
    const onDelete = vi.fn()
    const onMove = vi.fn()
    render(
      <BoardCard
        {...advancedControls}
        card={card}
        active={false}
        zoom={1}
        onMove={onMove}
        onDelete={onDelete}
        onJump={vi.fn()}
        onActiveChange={vi.fn()}
      />,
    )
    const close = screen.getByRole("button", { name: "카드 닫기" })

    fireEvent.pointerDown(close, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.click(close)

    expect(onDelete).toHaveBeenCalledWith(card.id)
    expect(onMove).not.toHaveBeenCalled()
  })

  it("offers a direct translation-to-note action", () => {
    const onConvertToNote = vi.fn()
    render(
      <BoardCard
        {...advancedControls}
        card={translationCard}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onConvertToNote={onConvertToNote}
        onActiveChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "번역을 주석으로 저장" }))

    expect(onConvertToNote).toHaveBeenCalledWith(translationCard.id)
  })

  it("opens a short selection translation as a compact card", () => {
    // Given / When
    render(
      <BoardCard
        {...advancedControls}
        card={translationCard}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onActiveChange={vi.fn()}
      />,
    )

    // Then
    expect(screen.getByLabelText("페이지 번역, 1 페이지 연결 카드")).toHaveStyle({
      height: "180px",
    })
  })

  it("edits a post-it as Markdown and commits on command-enter", () => {
    const sticky = boardCardSchema.parse({
      ...card,
      id: "2889c232-6a05-46df-bd89-9f128b49ad42",
      kind: "sticky",
      body: "",
    })
    const onBodyChange = vi.fn()
    render(
      <BoardCard
        {...advancedControls}
        card={sticky}
        active
        autoEdit
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onBodyChange={onBodyChange}
        onActiveChange={vi.fn()}
      />,
    )
    const editor = screen.getByRole("textbox", { name: "포스트잇 내용" })

    fireEvent.change(editor, { target: { value: "**핵심**\n\n$$x=1$$" } })
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true })

    expect(onBodyChange).toHaveBeenCalledWith(sticky.id, "**핵심**\n\n$$x=1$$")
    expect(screen.getByText("핵심").tagName).toBe("STRONG")
  })

  it("minimizes to a persistent bar and removes the dead overflow menu", () => {
    const onMinimize = vi.fn()
    render(
      <BoardCard
        {...advancedControls}
        card={card}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onMinimize={onMinimize}
        onActiveChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "카드 최소화" }))

    expect(onMinimize).toHaveBeenCalledWith(card.id)
    expect(screen.queryByRole("button", { name: "카드 메뉴" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "카드 크기 조절" })).toBeInTheDocument()
  })

  it("does not select a card from passive pointer hover", () => {
    // Given
    const onActiveChange = vi.fn()
    render(
      <BoardCard
        {...advancedControls}
        card={card}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onActiveChange={onActiveChange}
      />,
    )
    const cardElement = screen.getByLabelText("주석, 1 페이지 연결 카드")

    // When
    fireEvent.pointerEnter(cardElement)

    // Then
    expect(onActiveChange).not.toHaveBeenCalled()
  })

  it("selects a card from pointer down", () => {
    // Given
    const onActiveChange = vi.fn()
    render(
      <BoardCard
        {...advancedControls}
        card={card}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onActiveChange={onActiveChange}
      />,
    )

    // When
    fireEvent.pointerDown(screen.getByLabelText("주석, 1 페이지 연결 카드"), { pointerId: 1 })

    // Then
    expect(onActiveChange).toHaveBeenCalledWith(card.id)
  })

  it("shows a progress bar while an AI card is loading", () => {
    const loading = boardCardSchema.parse({ ...card, loading: true, kind: "explanation" })
    render(
      <BoardCard
        {...advancedControls}
        card={loading}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onActiveChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("AI 응답 생성 중")).toBeVisible()
  })

  it("keeps long research cards scrollable while post-its retain natural height", () => {
    const { unmount } = render(
      <BoardCard
        {...advancedControls}
        card={{ ...card, kind: "explanation" }}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onActiveChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("주석, 1 페이지 연결 카드")).toHaveStyle({ height: "420px" })
    unmount()

    render(
      <BoardCard
        {...advancedControls}
        card={{ ...card, kind: "sticky" }}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onActiveChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText("주석, 1 페이지 연결 카드")).not.toHaveStyle({ height: "420px" })
  })

  it("contains wheel input inside the scrollable card body", () => {
    // Given
    const onBoardWheel = vi.fn()
    const { container } = render(
      <div onWheel={onBoardWheel}>
        <BoardCard
          {...advancedControls}
          card={{ ...card, kind: "explanation" }}
          active={false}
          zoom={1}
          onMove={vi.fn()}
          onDelete={vi.fn()}
          onJump={vi.fn()}
          onActiveChange={vi.fn()}
        />
      </div>,
    )
    const cardBody = container.querySelector(".card-body")
    if (!(cardBody instanceof HTMLElement)) throw new Error("card body must render")

    // When
    fireEvent.wheel(cardBody, { deltaY: 120 })

    // Then
    expect(onBoardWheel).not.toHaveBeenCalled()
  })

  it("explains a citation score with all five bounded components", () => {
    const citation = boardCardSchema.parse({
      ...card,
      id: "0e8a43e8-cf33-4fb2-84bc-7e6575db6835",
      kind: "citation",
      title: "DeepMind, 2025",
      sourceMeta: {
        title: "AlphaEvolve",
        authors: ["Google DeepMind"],
        year: 2025,
        venue: "arXiv",
        abstract: null,
        doi: null,
        url: "https://arxiv.org/abs/2506.13131v1",
        citationCount: null,
        assessment: {
          breakdown: {
            dependency: 3,
            methodological: 0,
            conceptual: 3,
            evidentiary: 2,
            contextSufficiency: 5,
          },
          confidence: 0.7,
          citationReason: "배경 예시로 인용했습니다.",
          readingValue: "초록 확인으로 충분합니다.",
          reasons: ["방법 의존성이 낮습니다."],
          recommendedSections: ["abstract"],
          limitations: [],
          score: 13,
          tier: "pass",
        },
      },
    })
    render(
      <BoardCard
        {...advancedControls}
        card={citation}
        active={false}
        zoom={1}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onJump={vi.fn()}
        onActiveChange={vi.fn()}
      />,
    )

    expect(screen.getByText("현재 논문 의존도")).toBeVisible()
    expect(screen.getByText("3/30")).toBeVisible()
    expect(screen.getByText("방법 관련성")).toBeVisible()
    expect(screen.getByText("0/25")).toBeVisible()
    expect(screen.getByText("문맥 충분성")).toBeVisible()
    expect(screen.getByText("5/10")).toBeVisible()
  })
})
