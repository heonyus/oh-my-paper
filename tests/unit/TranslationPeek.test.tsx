import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TranslationPeek } from "../../src/renderer/components/TranslationPeek"
import { interruptedCardBody } from "../../src/renderer/lib/structureCardState"
import { boardCardSchema } from "../../src/shared/schemas"

const card = boardCardSchema.parse({
  id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
  documentId: "aabbccddeeff0011",
  kind: "translation",
  title: "numerator",
  body: "1. **분자**\n2. 분수의 윗부분",
  x: 0,
  y: 0,
  minimized: false,
  anchor: {
    page: 1,
    quote: "numerator",
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

function renderPeek(shown: typeof card, onRetry = vi.fn()) {
  render(
    <TranslationPeek
      card={shown}
      anchor={{ x: 400, top: 200, bottom: 218 }}
      bounds={{ left: 8, right: 992, top: 8 }}
      onPointerEnter={vi.fn()}
      onPointerLeave={vi.fn()}
      onDelete={vi.fn()}
      onRetry={onRetry}
    />,
  )
  return onRetry
}

describe("TranslationPeek", () => {
  it("lists a word's meanings and offers to copy them", () => {
    renderPeek(card)

    expect(screen.getByText("분자")).toBeInTheDocument()
    expect(screen.getByText("분수의 윗부분")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "번역 복사" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "다시 번역" })).not.toBeInTheDocument()
  })

  it.each([
    ["", "a translation saved empty"],
    [interruptedCardBody, "a translation that was cut off"],
  ])("says no translation came back and offers to ask again (%s: %s)", (body) => {
    const onRetry = renderPeek({ ...card, body })

    expect(screen.getByRole("status")).toHaveTextContent("번역을 받지 못했습니다.")
    // Nothing to copy, and the stored notice is not shown as if it were the translation.
    expect(screen.queryByRole("button", { name: "번역 복사" })).not.toBeInTheDocument()
    expect(screen.queryByText(interruptedCardBody)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "다시 번역" }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "번역 지우기" })).toBeInTheDocument()
  })

  it("shows that a translation asked for again is on its way", () => {
    renderPeek({ ...card, body: "", loading: true })

    expect(screen.getByRole("status")).toHaveTextContent("번역하는 중…")
    expect(screen.queryByRole("button", { name: "다시 번역" })).not.toBeInTheDocument()
  })
})
