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

describe("BoardCard controls", () => {
  it("closes from the X button without starting a card drag", () => {
    const onDelete = vi.fn()
    const onMove = vi.fn()
    render(
      <BoardCard
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
})
