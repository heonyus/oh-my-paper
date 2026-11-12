import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BoardCardsLayer } from "../../src/renderer/components/BoardCardsLayer"
import { trackQuickMemo } from "../../src/renderer/lib/quickMemos"
import { boardCardSchema } from "../../src/shared/schemas"

const markdownRenders = vi.hoisted(() => ({ count: 0 }))
vi.mock("../../src/renderer/components/MarkdownContent", () => ({
  MarkdownContent: ({ source }: { readonly source: string }) => {
    markdownRenders.count += 1
    return <div>{source}</div>
  },
}))

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

  it("leaves an unchanged card alone when the board around it is drawn again", () => {
    const explanation = boardCardSchema.parse({
      ...translation,
      id: "0f6a3a4e-77c2-4d0f-9b0e-8a1f3f1b2c3d",
      kind: "explanation",
      title: "설명",
    })
    const cards = [explanation]
    const layer = (zoom: number, items = cards) => (
      <BoardCardsLayer
        cards={items}
        activeId={null}
        autoEditId={null}
        zoom={zoom}
        onActiveChange={vi.fn()}
        getCards={() => items}
        commitCards={vi.fn()}
        previewCards={vi.fn()}
        onJump={vi.fn()}
        onAsk={vi.fn(async () => "answer")}
        onRegenerateTitle={vi.fn(async () => "title")}
      />
    )
    const { rerender } = render(layer(1))
    const drawn = markdownRenders.count
    expect(drawn).toBeGreaterThan(0)

    // A pan commit: new handler functions, the same cards and zoom.
    rerender(layer(1))
    expect(markdownRenders.count).toBe(drawn)

    // The card's own text changed: it is drawn again.
    rerender(layer(1, [{ ...explanation, body: "새 본문" }]))
    expect(markdownRenders.count).toBeGreaterThan(drawn)
    expect(screen.getByText("새 본문")).toBeInTheDocument()
  })
})

describe("a memo opened with N", () => {
  const memo = boardCardSchema.parse({
    ...translation,
    id: "5d0c1c6a-0d0b-4a53-9a38-3f0a6f6f8b11",
    kind: "sticky",
    title: "메모",
    body: "",
  })

  it("is taken away again when the reader leaves it empty", () => {
    vi.useFakeTimers()
    const commitCards = vi.fn()
    const settle = vi.fn((body: string) => (body.trim() ? ("keep" as const) : ("discard" as const)))
    trackQuickMemo(memo.id, settle)
    renderLayer([translation, memo], commitCards)

    fireEvent.blur(screen.getByRole("textbox", { name: "포스트잇 내용" }))
    act(() => vi.runAllTimers())

    expect(settle).toHaveBeenCalledWith("")
    expect(commitCards).toHaveBeenCalledWith([translation])
    vi.useRealTimers()
  })

  it("stays on the board once something is written, and settles only once", async () => {
    const commitCards = vi.fn()
    const settle = vi.fn(() => "keep" as const)
    const written = { ...memo, body: "요지를 먼저 쓴다" }
    trackQuickMemo(written.id, settle)
    renderLayer([translation, written], commitCards)
    const editor = screen.getByRole("textbox", { name: "포스트잇 내용" })

    fireEvent.blur(editor)
    await waitFor(() => expect(settle).toHaveBeenCalledWith("요지를 먼저 쓴다"))
    fireEvent.blur(editor)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })

    expect(settle).toHaveBeenCalledTimes(1)
    expect(commitCards).not.toHaveBeenCalled()
  })
})
