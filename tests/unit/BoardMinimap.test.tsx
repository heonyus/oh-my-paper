import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BoardMinimap } from "../../src/renderer/components/BoardMinimap"

describe("BoardMinimap", () => {
  it("navigates by click and exposes a first-page recovery action", () => {
    Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true })
    const onNavigate = vi.fn()
    const onHome = vi.fn()
    const onClose = vi.fn()
    render(
      <BoardMinimap
        bounds={{ x: 300, y: 64, width: 816, height: 4_000 }}
        pages={[
          { x: 300, y: 64, width: 816, height: 1_056 },
          { x: 300, y: 1_136, width: 816, height: 1_056 },
        ]}
        cards={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        available={{ width: 1_000, height: 700 }}
        currentPage={1}
        onNavigate={onNavigate}
        onHome={onHome}
        onClose={onClose}
      />,
    )
    const map = screen.getByLabelText("미니맵 탐색")
    expect(map.querySelectorAll(".minimap-document")).toHaveLength(1)
    expect(map.querySelectorAll(".minimap-page")).toHaveLength(1)
    expect(screen.getByText("2p")).toBeVisible()
    Object.defineProperty(map, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 140, bottom: 180, width: 140, height: 180 }),
    })
    Object.defineProperty(map, "setPointerCapture", { value: vi.fn() })

    fireEvent.pointerDown(map, { pointerId: 1, clientX: 70, clientY: 90 })
    expect(onNavigate).toHaveBeenCalledWith({ x: 708, y: 2_064 })
    fireEvent.click(screen.getByRole("button", { name: "첫 페이지로" }))
    expect(onHome).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "미니맵 숨기기" }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
