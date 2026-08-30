import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SidebarResizeHandle } from "../../src/renderer/components/SidebarResizeHandle"

describe("SidebarResizeHandle", () => {
  it("changes width from the keyboard and exposes separator bounds", () => {
    const onWidthChange = vi.fn()
    render(
      <SidebarResizeHandle
        label="연구 사이드바 너비 조절"
        width={340}
        minimum={300}
        maximum={560}
        edge="start"
        onWidthChange={onWidthChange}
      />,
    )
    const handle = screen.getByRole("separator", { name: "연구 사이드바 너비 조절" })

    fireEvent.keyDown(handle, { key: "ArrowRight" })

    expect(handle).toHaveAttribute("aria-valuenow", "340")
    expect(onWidthChange).toHaveBeenCalledWith(356)
  })
})
