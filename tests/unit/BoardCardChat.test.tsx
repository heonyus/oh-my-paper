import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { BoardCardChat } from "../../src/renderer/components/BoardCardChat"
import { boardCardSchema } from "../../src/shared/schemas"

const card = boardCardSchema.parse({
  id: "42ad8d84-c1ee-45b4-a022-6cf0d4c14278",
  documentId: "aabbccddeeff0011",
  kind: "explanation",
  title: "Abstract 해설",
  body: "cached explanation",
  x: 800,
  y: 240,
  minimized: false,
  anchor: {
    page: 1,
    quote: "Abstract",
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

describe("BoardCardChat", () => {
  it("persists a user question and assistant answer", async () => {
    const onChange = vi.fn()
    const onAsk = vi.fn(async () => "근거 기반 답변")
    render(<BoardCardChat card={card} onChange={onChange} onAsk={onAsk} />)

    const composer = screen.getByLabelText("카드에 후속 질문")
    expect(composer).not.toHaveAttribute("placeholder")
    await userEvent.type(composer, "핵심 한계는?")
    await userEvent.click(screen.getByRole("button", { name: "후속 질문 보내기" }))

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(onAsk).toHaveBeenCalledWith(
      "핵심 한계는?",
      [{ role: "user", content: "핵심 한계는?" }],
      expect.any(Function),
    )
    expect(onChange.mock.lastCall?.[0]).toEqual([
      { role: "user", content: "핵심 한계는?" },
      { role: "assistant", content: "근거 기반 답변" },
    ])
  })

  it("renders the answer as markdown while it is still streaming", async () => {
    let finish: (answer: string) => void = () => undefined
    const onAsk = vi.fn(
      (_question: string, _history: unknown, onDelta?: (delta: string) => void) =>
        new Promise<string>((resolve) => {
          onDelta?.("## 결론\n\n네, **맞습니다**. 두 젖산 [[p.4 | lactate]]")
          finish = resolve
        }),
    )
    render(<BoardCardChat card={card} onChange={vi.fn()} onAsk={onAsk} onCitation={vi.fn()} />)

    await userEvent.type(screen.getByLabelText("카드에 후속 질문"), "보간 방향은?")
    await userEvent.click(screen.getByRole("button", { name: "후속 질문 보내기" }))

    expect(await screen.findByRole("heading", { name: "결론" })).toBeInTheDocument()
    expect(screen.getByText("맞습니다").tagName).toBe("STRONG")
    expect(screen.getByRole("button", { name: /p\.4/ })).toBeInTheDocument()
    expect(screen.queryByText(/## 결론/)).toBeNull()
    finish("## 결론\n\n네, **맞습니다**. 두 젖산 [[p.4 | lactate]]")
  })

  it("turns citations in answers into page chips", async () => {
    const onCitation = vi.fn()
    const cited = {
      ...card,
      chat: [
        { role: "user" as const, content: "근거는?" },
        {
          role: "assistant" as const,
          content: "성능이 올랐다 [[p.4 | accuracy improves by 3 points]].",
        },
      ],
    }
    render(
      <BoardCardChat card={cited} onChange={vi.fn()} onAsk={vi.fn()} onCitation={onCitation} />,
    )

    expect(screen.queryByText(/\[\[p\.4/)).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: /p\.4/ }))
    expect(onCitation).toHaveBeenCalledWith({ page: 4, quote: "accuracy improves by 3 points" })
  })
})
