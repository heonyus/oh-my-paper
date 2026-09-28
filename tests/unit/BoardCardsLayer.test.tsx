import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BoardCardsLayer } from "../../src/renderer/components/BoardCardsLayer"
import { boardCardSchema } from "../../src/shared/schemas"

const translation = boardCardSchema.parse({
  id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
  documentId: "aabbccddeeff0011",
  kind: "translation",
  title: "source",
  body: "1. 출처\n2. 근거\n3. 정보원",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 1,
    quote: "source",
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

const highlight = boardCardSchema.parse({
  ...translation,
  id: "2889c232-6a05-46df-bd89-9f128b49ad42",
  kind: "highlight",
  title: "번역 주석",
})

function renderLayer(cards = [translation], commitCards = vi.fn(), onActiveChange = vi.fn()) {
  return render(
    <BoardCardsLayer
      cards={cards}
      activeId={translation.id}
      autoEditId={null}
      zoom={1}
      onActiveChange={onActiveChange}
      getCards={() => cards}
      commitCards={commitCards}
      previewCards={vi.fn()}
      onJump={vi.fn()}
      onAsk={vi.fn(async () => "answer")}
      onRegenerateTitle={vi.fn(async () => "title")}
    />,
  )
}

describe("BoardCardsLayer annotations", () => {
  it("does not render persistent highlight annotations as floating cards", () => {
    renderLayer([translation, highlight])

    expect(screen.getByLabelText("source, 1 페이지 연결 카드")).toBeVisible()
    expect(screen.queryByLabelText("번역 주석, 1 페이지 연결 카드")).not.toBeInTheDocument()
  })

  it("replaces a translation card with a non-floating highlight annotation", () => {
    const commitCards = vi.fn()
    const onActiveChange = vi.fn()
    renderLayer([translation], commitCards, onActiveChange)

    fireEvent.click(screen.getByRole("button", { name: "번역을 주석으로 저장" }))

    expect(onActiveChange).toHaveBeenCalledWith(null)
    expect(commitCards.mock.lastCall?.[0]?.[0]).toMatchObject({
      kind: "highlight",
      title: "AI 번역",
      body: translation.body,
      anchor: translation.anchor,
    })
  })
})
