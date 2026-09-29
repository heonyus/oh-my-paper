import { act, fireEvent, render, screen } from "@testing-library/react"
import { type JSX, type ReactNode, useRef, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useBoardGestures } from "../../src/renderer/lib/useBoardGestures"
import type { Viewport } from "../../src/shared/schemas"

const initialViewport: Viewport = { x: 0, y: 0, zoom: 1 }

function Harness(): JSX.Element {
  const boardRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(initialViewport)
  const gestures = useBoardGestures({
    wheelTargetRef: boardRef,
    viewport,
    onViewportChange: setViewport,
    onClearSelection: vi.fn(),
    tool: "select",
  })
  return (
    <div
      ref={boardRef}
      data-testid="board"
      onPointerDown={gestures.startPan}
      onPointerMove={gestures.movePan}
      onPointerUp={gestures.endPan}
    >
      <span data-testid="page" className="page">
        selected text
      </span>
      {viewport.x},{viewport.y},{viewport.zoom}
    </div>
  )
}

function PreviewHarness({
  onPreview,
  onCommit,
  rerenderOnPreview = false,
  children,
}: {
  readonly onPreview: (viewport: Viewport) => void
  readonly onCommit: (viewport: Viewport) => void
  readonly rerenderOnPreview?: boolean
  readonly children?: ReactNode
}): JSX.Element {
  const boardRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(initialViewport)
  const [, rerender] = useState(0)
  const preview = (viewport: Viewport): void => {
    onPreview(viewport)
    if (rerenderOnPreview) {
      rerender((value) => value + 1)
      setViewport((current) => ({ ...current }))
    }
  }
  const gestures = useBoardGestures({
    wheelTargetRef: boardRef,
    viewport,
    onViewportChange: (next) => {
      setViewport(next)
      onCommit(next)
    },
    onPanPreview: preview,
    constrainPan: (viewport) => ({
      ...viewport,
      x: Math.min(40, viewport.x),
      y: Math.min(50, viewport.y),
    }),
    onClearSelection: vi.fn(),
    tool: "select",
  })
  return (
    <div
      ref={boardRef}
      data-testid="preview-board"
      data-panning={gestures.panning}
      onPointerDown={gestures.startPan}
      onPointerMove={gestures.movePan}
      onPointerUp={gestures.endPan}
    >
      {children}
    </div>
  )
}

function TranslationPane(): JSX.Element {
  return (
    <section className="page-translation-pane">
      <div data-testid="translation-body" className="page-translation-body">
        번역
      </div>
    </section>
  )
}

function scrollableBody(scrollTop: number, overflowY = "auto"): HTMLElement {
  const body = screen.getByTestId("translation-body")
  body.style.overflowY = overflowY
  Object.defineProperty(body, "scrollHeight", { value: 800, configurable: true })
  Object.defineProperty(body, "clientHeight", { value: 400, configurable: true })
  body.scrollTop = scrollTop
  return body
}

describe("board pan gestures", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  it("temporarily disables native text selection while panning", () => {
    let panFrame: FrameRequestCallback | null = null
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      panFrame = callback
      return 1
    })
    Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true })
    render(<Harness />)
    const board = screen.getByTestId("board")
    Object.defineProperty(board, "setPointerCapture", { value: vi.fn() })
    window.getSelection()?.selectAllChildren(board)
    expect(window.getSelection()?.toString()).not.toBe("")

    fireEvent.pointerDown(board, {
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 30,
    })
    expect(window.getSelection()?.toString()).toBe("")
    expect(board).toHaveStyle({ userSelect: "none" })

    fireEvent.pointerMove(board, { pointerId: 1, clientX: 50, clientY: 70 })
    act(() => panFrame?.(0))
    expect(board).toHaveTextContent("30,40")
    fireEvent.pointerUp(board, { pointerId: 1 })
    expect(board.style.userSelect).toBe("")
  })

  it("preserves native text selection when the pointerup was not a pan", () => {
    render(<Harness />)
    const page = screen.getByTestId("page")
    window.getSelection()?.selectAllChildren(page)
    expect(window.getSelection()?.toString()).toBe("selected text")

    fireEvent.pointerUp(page, { pointerId: 2 })

    expect(window.getSelection()?.toString()).toBe("selected text")
  })

  it("coalesces rapid wheel zoom into one animation-frame update", () => {
    let queuedFrame: FrameRequestCallback | null = null
    const requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        queuedFrame = callback
        return 1
      })
    render(<Harness />)
    const board = screen.getByTestId("board")

    for (let index = 0; index < 3; index += 1) {
      fireEvent.wheel(board, { ctrlKey: true, deltaY: -20, clientX: 100, clientY: 100 })
    }

    expect(requestFrame).toHaveBeenCalledOnce()
    expect(board).toHaveTextContent("0,0,1")
    act(() => queuedFrame?.(0))
    const zoom = Number(board.textContent?.split(",")[2])
    expect(zoom).toBeGreaterThan(1.3)
  })

  it("locks a diagonal trackpad burst to its initial dominant axis", () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    render(<Harness />)
    const board = screen.getByTestId("board")

    fireEvent.wheel(board, { deltaX: 7, deltaY: 100 })
    act(() => frames.shift()?.(0))
    expect(board).toHaveTextContent("0,-100,1")

    fireEvent.wheel(board, { deltaX: 9, deltaY: 8 })
    act(() => frames.shift()?.(16))
    expect(board).toHaveTextContent("0,-108,1")
  })

  it("coalesces rapid pointer panning into one animation-frame update", () => {
    const frames: FrameRequestCallback[] = []
    const requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frames.push(callback)
        return frames.length
      })
    render(<Harness />)
    const board = screen.getByTestId("board")
    Object.defineProperty(board, "setPointerCapture", { value: vi.fn() })

    fireEvent.pointerDown(board, { button: 0, pointerId: 4, clientX: 20, clientY: 30 })
    fireEvent.pointerMove(board, { pointerId: 4, clientX: 40, clientY: 50 })
    fireEvent.pointerMove(board, { pointerId: 4, clientX: 60, clientY: 70 })
    fireEvent.pointerMove(board, { pointerId: 4, clientX: 80, clientY: 90 })

    expect(requestFrame).toHaveBeenCalledOnce()
    expect(board).toHaveTextContent("0,0,1")
    act(() => frames.shift()?.(0))
    expect(board).toHaveTextContent("60,60,1")
  })

  it("previews pointer pan without root commits and commits once on release", () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    render(<PreviewHarness onPreview={onPreview} onCommit={onCommit} />)
    const board = screen.getByTestId("preview-board")
    Object.defineProperty(board, "setPointerCapture", { value: vi.fn() })

    fireEvent.pointerDown(board, { button: 0, pointerId: 8, clientX: 20, clientY: 30 })
    fireEvent.pointerMove(board, { pointerId: 8, clientX: 50, clientY: 70 })
    fireEvent.pointerMove(board, { pointerId: 8, clientX: 80, clientY: 100 })
    expect(board).toHaveAttribute("data-panning", "true")
    expect(onCommit).not.toHaveBeenCalled()

    act(() => frames.shift()?.(0))
    expect(onPreview).toHaveBeenLastCalledWith({ x: 40, y: 50, zoom: 1 })
    fireEvent.pointerUp(board, { pointerId: 8 })
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenLastCalledWith({ x: 40, y: 50, zoom: 1 })
    act(() => frames.shift()?.(16))
    expect(board).toHaveAttribute("data-panning", "false")
  })

  it("previews trackpad pan and commits once after the wheel burst ends", async () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    render(<PreviewHarness onPreview={onPreview} onCommit={onCommit} />)
    const board = screen.getByTestId("preview-board")

    fireEvent.wheel(board, { deltaX: 0, deltaY: 30 })
    fireEvent.wheel(board, { deltaX: 0, deltaY: 40 })
    act(() => frames.shift()?.(0))

    expect(onPreview).toHaveBeenLastCalledWith({ x: 0, y: -70, zoom: 1 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(board).toHaveAttribute("data-panning", "true")
    await act(async () => vi.advanceTimersByTimeAsync(180))
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenLastCalledWith({ x: 0, y: -70, zoom: 1 })
    act(() => frames.shift()?.(16))
    expect(board).toHaveAttribute("data-panning", "false")
  })

  it("keeps a wheel pan pending while the preview rerenders its parent", async () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const onCommit = vi.fn()
    render(<PreviewHarness onPreview={vi.fn()} onCommit={onCommit} rerenderOnPreview />)
    const board = screen.getByTestId("preview-board")

    fireEvent.wheel(board, { deltaX: 0, deltaY: 30 })
    act(() => frames.shift()?.(0))
    await act(async () => vi.advanceTimersByTimeAsync(180))

    expect(onCommit).toHaveBeenLastCalledWith({ x: 0, y: -30, zoom: 1 })
  })

  it("keeps a sideways swipe moving the board over a page translation", () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const onPreview = vi.fn()
    render(
      <PreviewHarness onPreview={onPreview} onCommit={vi.fn()}>
        <TranslationPane />
      </PreviewHarness>,
    )
    const body = scrollableBody(0, "hidden")

    expect(fireEvent.wheel(body, { deltaX: 60, deltaY: 2 })).toBe(false)
    expect(fireEvent.wheel(body, { deltaX: 0, deltaY: 40 })).toBe(false)
    act(() => frames.shift()?.(0))

    expect(onPreview).toHaveBeenLastCalledWith({ x: -60, y: -40, zoom: 1 })
  })

  it("lets a page translation scroll its own text until it runs out", async () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const onPreview = vi.fn()
    render(
      <PreviewHarness onPreview={onPreview} onCommit={vi.fn()}>
        <TranslationPane />
      </PreviewHarness>,
    )
    const body = scrollableBody(0)

    expect(fireEvent.wheel(body, { deltaX: 0, deltaY: 40 })).toBe(true)
    body.scrollTop = 400
    // The rest of the burst stays with the text, even with nothing left to scroll.
    expect(fireEvent.wheel(body, { deltaX: 0, deltaY: 40 })).toBe(true)
    expect(onPreview).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTimeAsync(180))
    expect(fireEvent.wheel(body, { deltaX: 0, deltaY: 40 })).toBe(false)
    act(() => frames.shift()?.(0))
    expect(onPreview).toHaveBeenLastCalledWith({ x: 0, y: -40, zoom: 1 })
  })

  it("keeps a board pan going when a scrollable translation slides under the cursor", () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const onPreview = vi.fn()
    render(
      <PreviewHarness onPreview={onPreview} onCommit={vi.fn()}>
        <TranslationPane />
      </PreviewHarness>,
    )
    const body = scrollableBody(0)

    fireEvent.wheel(screen.getByTestId("preview-board"), { deltaX: 0, deltaY: 30 })
    expect(fireEvent.wheel(body, { deltaX: 0, deltaY: 40 })).toBe(false)
    act(() => frames.shift()?.(0))

    expect(onPreview).toHaveBeenLastCalledWith({ x: 0, y: -70, zoom: 1 })
  })
})
