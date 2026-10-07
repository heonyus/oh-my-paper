import { render, screen } from "@testing-library/react"
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
  it("draws highlights and translations on the passage, not as floating cards", () => {
    const explanation = boardCardSchema.parse({
      ...translation,
      id: "0f6a3a4e-77c2-4d0f-9b0e-8a1f3f1b2c3d",
      kind: "explanation",
      title: "설명",
    })
    renderLayer([translation, highlight, explanation])

    expect(screen.getByLabelText("설명, 1 페이지 연결 카드")).toBeVisible()
    expect(screen.queryByLabelText("source, 1 페이지 연결 카드")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("번역 주석, 1 페이지 연결 카드")).not.toBeInTheDocument()
  })
})
