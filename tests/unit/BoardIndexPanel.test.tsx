import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  type BoardCategoryKind,
  BoardIndexPanel,
} from "../../src/renderer/components/BoardIndexPanel"
import { type BoardCard, boardCardSchema } from "../../src/shared/schemas"

function card(
  id: string,
  kind: BoardCategoryKind | "sticky",
  title: string,
  body: string,
  quote: string,
): BoardCard {
  return boardCardSchema.parse({
    id,
    documentId: "aabbccddeeff0011",
    kind,
    title,
    body,
    x: 800,
    y: 240,
    minimized: false,
    anchor: {
      page: 3,
      quote,
      x: 420,
      y: 180,
      fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
    },
  })
}

describe("BoardIndexPanel", () => {
  it("presents each category with purpose-specific content and action", async () => {
    const onJump = vi.fn()
    const translation = card(
      "42ad8d84-c1ee-45b4-a022-6cf0d4c14278",
      "translation",
      "선택 번역",
      "검증 가능한 번역 결과입니다.",
      "A verifiable source sentence.",
    )
    const sticky = card(
      "63b52673-19ca-4b24-9680-4d3e7615887c",
      "sticky",
      "포스트잇",
      "",
      "보드 포스트잇",
    )
    const highlight = card(
      "88bdf14a-eace-4d70-80be-45ea55e8dd06",
      "highlight",
      "번역 주석",
      "saved",
      "This is the highlighted evidence.",
    )
    const { container, rerender } = render(
      <BoardIndexPanel cards={[translation]} kind="translation" label="번역" onJump={onJump} />,
    )

    expect(screen.getByText("번역문과 원문을 함께 봅니다.")).toBeVisible()
    expect(screen.getByText("검증 가능한 번역 결과입니다.")).toBeVisible()
    expect(screen.getByText("A verifiable source sentence.")).toBeVisible()
    const translationItem = screen.getByRole("button", { name: /선택 번역/u })
    expect(translationItem).toHaveAttribute("data-kind", "translation")
    await userEvent.click(translationItem)
    expect(onJump).toHaveBeenCalledWith(translation.id)

    // Sticky notes are no longer made; the ones already on a board are listed with the memos.
    rerender(<BoardIndexPanel cards={[sticky]} kind="note" label="메모" onJump={onJump} />)
    expect(screen.getByText("보드에 남긴 메모와 그 원문을 함께 봅니다.")).toBeVisible()
    expect(screen.getByText("내용이 없는 포스트잇")).toBeVisible()
    expect(screen.queryByText("보드 포스트잇")).not.toBeInTheDocument()

    rerender(
      <BoardIndexPanel cards={[highlight]} kind="highlight" label="하이라이트" onJump={onJump} />,
    )
    expect(screen.getByText("saved")).toBeVisible()
    expect(screen.getByText("This is the highlighted evidence.")).toBeVisible()
    expect(screen.getByText("원문 위치 보기")).toBeVisible()
    expect(screen.queryByText("번역 주석")).not.toBeInTheDocument()
    expect(container.querySelectorAll(".board-index-icon")).toHaveLength(0)
  })

  it("gives AI cards, notes, and empty highlights distinct readable states", () => {
    const infographic = card(
      "18bdf14a-eace-4d70-80be-45ea55d8dd16",
      "infographic",
      "Figure 1 해설",
      "# Figure 1 분석\n레이더 차트와 성능 막대를 비교합니다.",
      "Figure 1 source caption",
    )
    const note = card(
      "28bdf14a-eace-4d70-80be-45ea55d8dd26",
      "note",
      "번역 주석",
      "검증 가능한 메모",
      "verifiable",
    )
    const { rerender } = render(
      <BoardIndexPanel cards={[infographic]} kind="infographic" label="AI 카드" onJump={vi.fn()} />,
    )

    expect(screen.getByText("그림·표 분석을 자료별로 봅니다.")).toBeVisible()
    const infographicPreview = screen.getByText(
      /Figure 1 분석 레이더 차트와 성능 막대를 비교합니다/u,
    )
    expect(infographicPreview).toBeVisible()
    expect(infographicPreview.textContent?.length ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      281,
    )
    rerender(<BoardIndexPanel cards={[note]} kind="note" label="메모" onJump={vi.fn()} />)
    expect(screen.getByText("보드에 남긴 메모와 그 원문을 함께 봅니다.")).toBeVisible()
    expect(screen.getByText("검증 가능한 메모")).toBeVisible()
    expect(screen.queryByText("보드에서 편집")).not.toBeInTheDocument()
    rerender(<BoardIndexPanel cards={[]} kind="highlight" label="하이라이트" onJump={vi.fn()} />)
    expect(screen.getByText("아직 저장된 항목이 없습니다.")).toBeVisible()
    expect(screen.getByText(/PDF 문장을 선택해 하이라이트/u)).toBeVisible()
  })
})
