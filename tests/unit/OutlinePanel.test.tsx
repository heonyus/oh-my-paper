import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { OutlinePanel } from "../../src/renderer/components/OutlinePanel"

describe("OutlinePanel", () => {
  it("jumps from the left outline and closes independently", async () => {
    const onJump = vi.fn()
    const onClose = vi.fn()
    render(
      <OutlinePanel
        currentPage={3}
        outline={[
          { title: "Introduction", page: 1 },
          { title: "Methods", page: 3 },
        ]}
        onJump={onJump}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole("complementary", { name: "논문 목차" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Methods.*p\.3/u })).toHaveAttribute(
      "aria-current",
      "page",
    )
    await userEvent.click(screen.getByRole("button", { name: /Introduction.*p\.1/u }))
    await userEvent.click(screen.getByRole("button", { name: "목차 닫기" }))

    expect(onJump).toHaveBeenCalledWith(1)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
