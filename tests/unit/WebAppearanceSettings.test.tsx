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
      screen.getByText("어텐션은 모든 토큰이 한 번에 다른 모든 토큰을 보게 합니다."),
    ).toBeVisible()
  })

  it("lists the Dracula and Tokyo Night Light themes beside system, light and dark", async () => {
    const onChange = vi.fn()
    render(
      <WebAppearanceSettings
        open={true}
        value={{ theme: "system", uiFontFamily: "wanted", uiFontScale: 1 }}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    )

    const picker = screen.getByLabelText("화면 모드")
    expect(
      Array.from(picker.querySelectorAll("option")).map((option) => [
        option.value,
        option.textContent,
      ]),
    ).toEqual([
      ["system", "시스템 설정"],
      ["light", "라이트"],
      ["dark", "다크"],
      ["dracula", "드라큘라"],
      ["tokyo-night-light", "도쿄 나이트 라이트"],
    ])

    await userEvent.selectOptions(picker, "dracula")
    await userEvent.selectOptions(picker, "tokyo-night-light")

    expect(onChange).toHaveBeenNthCalledWith(1, {
      theme: "dracula",
      uiFontFamily: "wanted",
      uiFontScale: 1,
    })
    expect(onChange).toHaveBeenNthCalledWith(2, {
      theme: "tokyo-night-light",
      uiFontFamily: "wanted",
      uiFontScale: 1,
    })
  })
})
