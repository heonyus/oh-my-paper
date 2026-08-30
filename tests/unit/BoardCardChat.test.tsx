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
    expect(onAsk).toHaveBeenCalledWith("핵심 한계는?", [{ role: "user", content: "핵심 한계는?" }])
    expect(onChange.mock.lastCall?.[0]).toEqual([
      { role: "user", content: "핵심 한계는?" },
      { role: "assistant", content: "근거 기반 답변" },
    ])
  })
})
