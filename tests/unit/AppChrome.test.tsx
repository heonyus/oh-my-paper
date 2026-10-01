import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Topbar } from "../../src/renderer/components/AppChrome"
import { documentIdSchema } from "../../src/shared/schemas"

describe("Topbar", () => {
  it("connects outline, tool, history, and zoom controls without search", async () => {
    const onToolChange = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const onToggleOutline = vi.fn()
    const onViewportChange = vi.fn()
    render(
      <Topbar
        documents={[]}
        activeDocumentId={documentIdSchema.parse("aabbccddeeff0011")}
        onDocumentChange={vi.fn()}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        onViewportChange={onViewportChange}
        tool="select"
        onToolChange={onToolChange}
        canUndo
        canRedo
        onUndo={onUndo}
        onRedo={onRedo}
        outlineOpen={false}
        onToggleOutline={onToggleOutline}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "목차 열기" }))
    await userEvent.click(screen.getByRole("button", { name: "이동 도구" }))
    await userEvent.click(screen.getByRole("button", { name: "실행 취소" }))
    await userEvent.click(screen.getByRole("button", { name: "다시 실행" }))
    await userEvent.click(screen.getByRole("button", { name: "확대" }))

    expect(screen.getByRole("combobox", { name: "읽는 논문" })).toBeInTheDocument()
    expect(onToggleOutline).toHaveBeenCalledOnce()
    expect(onToolChange).toHaveBeenCalledWith("pan")
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onRedo).toHaveBeenCalledOnce()
    expect(onViewportChange).toHaveBeenCalledWith({ x: 0, y: 0, zoom: 1.1 })
    expect(screen.queryByRole("button", { name: "검색" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "포스트잇 도구" })).not.toBeInTheDocument()
  })

  it("keeps the visible board center fixed during toolbar zoom", async () => {
    const board = document.createElement("div")
    board.className = "board-viewport"
    Object.defineProperties(board, {
      clientWidth: { value: 1000 },
      clientHeight: { value: 700 },
    })
    document.body.append(board)
    const onViewportChange = vi.fn()
    render(
      <Topbar
        documents={[]}
        activeDocumentId={documentIdSchema.parse("aabbccddeeff0011")}
        onDocumentChange={vi.fn()}
        viewport={{ x: -200, y: -300, zoom: 1 }}
        onViewportChange={onViewportChange}
        tool="select"
        onToolChange={vi.fn()}
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        outlineOpen={false}
        onToggleOutline={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "확대" }))

    const next = onViewportChange.mock.lastCall?.[0]
    expect(next?.x).toBeCloseTo(-270)
    expect(next?.y).toBeCloseTo(-365)
    expect(next?.zoom).toBe(1.1)
    board.remove()
  })
})
