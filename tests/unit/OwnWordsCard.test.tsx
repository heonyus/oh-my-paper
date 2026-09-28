import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type JSX, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { OwnWordsCard } from "../../src/renderer/components/OwnWordsCard"
import type { OwnWordsCheck } from "../../src/shared/ownWords"
import { type BoardCard, boardCardSchema } from "../../src/shared/schemas"

const baseCard = boardCardSchema.parse({
  id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
  documentId: "aabbccddeeff0011",
  kind: "note",
  title: "내 말로",
  body: "",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 2,
    quote: "Readers who write a gist first read the English source more closely.",
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

function Harness({
  initial,
  onCheck,
}: {
  readonly initial: BoardCard
  readonly onCheck: (card: BoardCard, signal: AbortSignal) => Promise<OwnWordsCheck>
}): JSX.Element {
  const [card, setCard] = useState(initial)
  return (
    <OwnWordsCard
      card={card}
      autoEdit={false}
      onBodyChange={(body) => setCard((current) => ({ ...current, body }))}
      onCheck={onCheck}
      onCheckChange={(ownCheck) => setCard((current) => ({ ...current, ownCheck }))}
      onJump={vi.fn()}
    />
  )
}

describe("OwnWordsCard", () => {
  it("opens an empty editor for a new card and for the old fixed annotation text", () => {
    const { rerender } = render(<Harness initial={baseCard} onCheck={vi.fn()} />)
    expect(screen.getByRole("textbox", { name: "내 말로 쓴 내용" })).toHaveValue("")

    rerender(
      <Harness
        key="legacy"
        initial={{ ...baseCard, body: "이 구절에 연결된 메모입니다." }}
        onCheck={vi.fn()}
      />,
    )
    expect(screen.getByRole("textbox", { name: "내 말로 쓴 내용" })).toHaveValue("")
  })

  it("checks the reader's words and marks the result out of date after an edit", async () => {
    const onCheck = vi.fn(
      async (card: BoardCard): Promise<OwnWordsCheck> => ({
        checkedAt: "2026-09-28T00:00:00.000Z",
        text: card.body.trim(),
        verdict: "match",
        note: "요지를 정확히 짚었습니다.",
        quote: "read the English source more closely",
      }),
    )
    render(<Harness initial={baseCard} onCheck={onCheck} />)

    await userEvent.type(
      screen.getByRole("textbox", { name: "내 말로 쓴 내용" }),
      "요지를 먼저 쓰면 원문을 더 꼼꼼히 읽는다",
    )
    await userEvent.tab()
    await userEvent.click(screen.getByRole("button", { name: "원문과 대조" }))

    expect(await screen.findByText("맞음")).toBeVisible()
    expect(screen.getByRole("button", { name: "근거 원문 2쪽으로 이동" })).toBeVisible()
    expect(onCheck.mock.calls[0]?.[0].body).toBe("요지를 먼저 쓰면 원문을 더 꼼꼼히 읽는다")

    await userEvent.click(screen.getByRole("button", { name: "고쳐 쓰기" }))
    await userEvent.type(screen.getByRole("textbox", { name: "내 말로 쓴 내용" }), " 고침")
    await userEvent.tab()

    expect(screen.getByText("고친 문장은 아직 대조하지 않았습니다.")).toBeVisible()
    expect(screen.getByRole("button", { name: "원문과 대조" })).toBeEnabled()
  })

  it("reports a failed check without inventing a verdict", async () => {
    render(
      <Harness
        initial={{ ...baseCard, body: "요지" }}
        onCheck={vi.fn(async () => {
          throw new Error("offline")
        })}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "원문과 대조" }))

    await waitFor(() =>
      expect(
        screen.getByText("대조하지 못했습니다. AI 연결을 확인한 뒤 다시 시도해주세요."),
      ).toBeVisible(),
    )
    expect(screen.queryByText("맞음")).not.toBeInTheDocument()
  })
})
