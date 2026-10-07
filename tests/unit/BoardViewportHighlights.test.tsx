import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BoardViewport } from "../../src/renderer/components/BoardViewport"
import type { BoardViewportProps } from "../../src/renderer/components/BoardViewportProps"
import type { BoardCard } from "../../src/renderer/types"
import { boardCardSchema, documentRecordSchema } from "../../src/shared/schemas"

vi.mock("../../src/renderer/components/PdfSurface", () => ({ PdfSurface: () => null }))
vi.mock("../../src/renderer/components/BoardNavigationController", () => ({
  BoardNavigationController: () => null,
}))

// jsdom has no PointerEvent, so fired pointer events would lose their coordinates.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
  }
}
if (typeof window.PointerEvent === "undefined") vi.stubGlobal("PointerEvent", TestPointerEvent)
HTMLElement.prototype.setPointerCapture ??= () => undefined
HTMLElement.prototype.releasePointerCapture ??= () => undefined
HTMLElement.prototype.hasPointerCapture ??= () => false

const highlight = boardCardSchema.parse({
  id: "2889c232-6a05-46df-bd89-9f128b49ad42",
  documentId: "aabbccddeeff0011",
  kind: "highlight",
  title: "하이라이트",
  body: "Patients without data",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 1,
    quote: "Patients without data",
    x: 100,
    y: 100,
    fragments: [
      { x: 100, y: 100, width: 100, height: 20 },
      { x: 100, y: 116, width: 100, height: 20 },
    ],
  },
})

function renderBoard(cards: readonly BoardCard[]) {
  const onCardsChange = vi.fn()
  const props: BoardViewportProps = {
    document: documentRecordSchema.parse({
      id: "aabbccddeeff0011",
      name: "paper.pdf",
      hash: "a".repeat(64),
      bytes: 1024,
      importedAt: "2026-08-30T00:00:00.000Z",
      pageCount: 3,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      quality: { textCharacters: 100, needsOcr: false, warnings: [] },
    }),
    viewport: { x: 0, y: 0, zoom: 1 },
    cards,
    onViewportChange: vi.fn(),
    onCardsChange,
    onCardsPreview: vi.fn(),
    onDocumentLoaded: vi.fn(),
    onPageActive: vi.fn(),
    currentPage: 1,
    onAiRequest: vi.fn(async () => ""),
    tool: "select",
    minimapVisible: false,
    onMinimapVisibleChange: vi.fn(),
  }
  const { container } = render(<BoardViewport {...props} />)
  for (const fragment of container.querySelectorAll<HTMLElement>("[data-highlight-id] > span")) {
    const left = Number.parseFloat(fragment.style.left)
    const top = Number.parseFloat(fragment.style.top)
    const width = Number.parseFloat(fragment.style.width)
    const height = Number.parseFloat(fragment.style.height)
    fragment.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: left, y: top, width, height }) as DOMRect
  }
  const viewport = container.querySelector<HTMLElement>(".board-viewport")
  if (!viewport) throw new Error("board viewport missing")
  return { container, viewport, onCardsChange }
}

function click(target: HTMLElement, x: number, y: number, endX = x): void {
  fireEvent.pointerDown(target, { clientX: x, clientY: y, button: 0, pointerId: 1 })
  fireEvent.pointerUp(target, { clientX: endX, clientY: y, button: 0, pointerId: 1 })
}

describe("board highlights", () => {
  it("draws each highlight as one yellow group rather than stacked fragments", () => {
    const { container } = renderBoard([highlight])

    const marks = container.querySelectorAll(".highlight-mark")
    expect(marks).toHaveLength(1)
    expect(marks[0]?.children).toHaveLength(2)
    expect(container.querySelectorAll(".source-highlight")).toHaveLength(0)
  })

  it("selects a clicked highlight and deletes it from its toolbar", () => {
    const { container, viewport, onCardsChange } = renderBoard([highlight])

    click(viewport, 150, 110)

    expect(container.querySelector("[data-highlight-id]")).toHaveAttribute("data-selected")
    fireEvent.click(screen.getByRole("button", { name: "하이라이트 삭제" }))
    expect(onCardsChange).toHaveBeenCalledWith([])
    expect(screen.queryByRole("button", { name: "하이라이트 삭제" })).toBeNull()
  })

  it("deletes the selected highlight with the Delete key and dismisses with Escape", () => {
    const { viewport, onCardsChange } = renderBoard([highlight])

    click(viewport, 150, 110)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("button", { name: "하이라이트 삭제" })).toBeNull()

    click(viewport, 150, 130)
    fireEvent.keyDown(window, { key: "Delete" })
    expect(onCardsChange).toHaveBeenCalledWith([])
  })

  it("ignores drags and clicks outside any highlight", () => {
    const { viewport } = renderBoard([highlight])

    click(viewport, 150, 110, 190)
    click(viewport, 400, 400)

    expect(screen.queryByRole("button", { name: "하이라이트 삭제" })).toBeNull()
  })
})

const translation = boardCardSchema.parse({
  id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
  documentId: "aabbccddeeff0011",
  kind: "translation",
  title: "presented",
  body: "1. **제시된다**\n2. 제시받다\n3. 마주하다",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 1,
    quote: "presented",
    x: 220,
    y: 309,
    fragments: [{ x: 100, y: 300, width: 120, height: 18 }],
  },
})

describe("board translations", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("tints a translated passage and shows its translation only while it is hovered", () => {
    const { container, viewport, onCardsChange } = renderBoard([translation])

    expect(container.querySelectorAll(".translation-mark")).toHaveLength(1)
    expect(screen.queryByLabelText("source, 1 페이지 연결 카드")).toBeNull()
    expect(screen.queryByRole("complementary", { name: "번역" })).toBeNull()

    fireEvent.pointerMove(viewport, { clientX: 150, clientY: 308, buttons: 0 })

    const peek = screen.getByRole("complementary", { name: "번역" })
    expect(peek).toHaveAttribute("data-side", "above")
    expect(peek.querySelector(".translation-peek-meanings")?.textContent).toBe(
      "제시된다제시받다마주하다",
    )
    fireEvent.click(within(peek).getByRole("button", { name: "번역 지우기" }))
    expect(onCardsChange).toHaveBeenCalledWith([])
  })

  it("puts the translation under a line near the top of the board", () => {
    const nearTop = boardCardSchema.parse({
      ...translation,
      anchor: { ...translation.anchor, fragments: [{ x: 100, y: 4, width: 120, height: 18 }] },
    })
    const { viewport } = renderBoard([nearTop])

    fireEvent.pointerMove(viewport, { clientX: 150, clientY: 12, buttons: 0 })

    expect(screen.getByRole("complementary", { name: "번역" })).toHaveAttribute(
      "data-side",
      "below",
    )
  })

  it("does not open while a button is held, and closes soon after the pointer leaves", () => {
    vi.useFakeTimers()
    const { viewport } = renderBoard([translation])

    fireEvent.pointerMove(viewport, { clientX: 150, clientY: 308, buttons: 1 })
    expect(screen.queryByRole("complementary", { name: "번역" })).toBeNull()

    fireEvent.pointerMove(viewport, { clientX: 150, clientY: 308, buttons: 0 })
    fireEvent.pointerMove(viewport, { clientX: 400, clientY: 500, buttons: 0 })
    expect(screen.getByRole("complementary", { name: "번역" })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(screen.queryByRole("complementary", { name: "번역" })).toBeNull()
  })

  it("reaches a translated word inside a translated paragraph", () => {
    const paragraph = boardCardSchema.parse({
      ...translation,
      id: "0f6a3a4e-77c2-4d0f-9b0e-8a1f3f1b2c3d",
      body: "문단 번역",
      anchor: {
        ...translation.anchor,
        quote: "a whole line of the paragraph",
        fragments: [{ x: 40, y: 300, width: 500, height: 18 }],
      },
    })
    const { viewport } = renderBoard([translation, paragraph])

    fireEvent.pointerMove(viewport, { clientX: 150, clientY: 308, buttons: 0 })
    expect(screen.getByRole("complementary", { name: "번역" })).toHaveTextContent("제시된다")

    fireEvent.pointerMove(viewport, { clientX: 400, clientY: 308, buttons: 0 })
    expect(screen.getByRole("complementary", { name: "번역" })).toHaveTextContent("문단 번역")
  })

  it("shows that a translation is still on its way", () => {
    const pending = boardCardSchema.parse({ ...translation, body: "", loading: true })
    const { container, viewport } = renderBoard([pending])

    expect(container.querySelector(".translation-mark")).toHaveAttribute("data-loading")
    fireEvent.pointerMove(viewport, { clientX: 150, clientY: 308, buttons: 0 })
    expect(screen.getByRole("status")).toHaveTextContent("번역하는 중…")
  })
})
