import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { WebAppearanceSettings } from "../../src/web/WebAppearanceSettings"

describe("WebAppearanceSettings", () => {
  it("offers theme and 50–200% scale controls without a font picker", async () => {
    const onChange = vi.fn()
    render(
      <WebAppearanceSettings
        open={true}
        value={{ theme: "system", uiFontFamily: "wanted", uiFontScale: 1 }}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText("글꼴")).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText("화면 모드"), "dark")
    await userEvent.click(screen.getByRole("button", { name: "200%" }))

    expect(onChange).toHaveBeenCalledWith({
      theme: "dark",
      uiFontFamily: "wanted",
      uiFontScale: 1,
    })
    expect(onChange).toHaveBeenCalledWith({
      theme: "system",
      uiFontFamily: "wanted",
      uiFontScale: 2,
    })
    expect(
      screen.getByText("읽은 것은 남고, 필요한 것은 다시 찾을 수 있어야 합니다."),
    ).toBeVisible()
  })
})
