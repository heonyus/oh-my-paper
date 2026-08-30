import { act, fireEvent, render, screen } from "@testing-library/react"
import { type JSX, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useBoardGestures } from "../../src/renderer/lib/useBoardGestures"
import type { Viewport } from "../../src/shared/schemas"

const initialViewport: Viewport = { x: 0, y: 0, zoom: 1 }

function Harness(): JSX.Element {
  const [viewport, setViewport] = useState(initialViewport)
  const gestures = useBoardGestures({
    viewport,
    onViewportChange: setViewport,
    onClearSelection: vi.fn(),
    tool: "select",
  })
  return (
    <div
      data-testid="board"
      onPointerDown={gestures.startPan}
      onPointerMove={gestures.movePan}
      onPointerUp={gestures.endPan}
      onWheel={gestures.handleWheel}
    >
      <span data-testid="page" className="page">
        selected text
      </span>
      {viewport.x},{viewport.y},{viewport.zoom}
    </div>
  )
}

describe("board pan gestures", () => {
  afterEach(() => vi.restoreAllMocks())
  it("temporarily disables native text selection while panning", () => {
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
})
