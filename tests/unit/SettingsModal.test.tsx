import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SettingsModal } from "../../src/renderer/components/SettingsModal"

describe("SettingsModal", () => {
  it("saves an encrypted OpenRouter configuration", async () => {
    const onSave = vi.fn(async () => {})
    const onFontScaleChange = vi.fn()
    render(
      <SettingsModal
        status={{ configured: false, provider: "openai", model: "gpt-5" }}
        fontScale={1}
        onClose={vi.fn()}
        onSave={onSave}
        onFontScaleChange={onFontScaleChange}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText("Provider"), "openrouter")
    await userEvent.clear(screen.getByLabelText("API 키"))
    await userEvent.type(
      screen.getByLabelText("API 키"),
      "sk-or-example-key-at-least-twenty-characters",
    )
    await userEvent.click(screen.getByRole("button", { name: "암호화하여 저장" }))

    expect(screen.getByLabelText("모델 ID")).toHaveValue("z-ai/glm-5.3-flash")
    expect(screen.queryByText(/ChatGPT Plus/)).not.toBeInTheDocument()
    expect(onSave).toHaveBeenCalledWith({
      provider: "openrouter",
      apiKey: "sk-or-example-key-at-least-twenty-characters",
      model: "z-ai/glm-5.3-flash",
    })
  })

  it("lets the user choose each OpenRouter model", async () => {
    render(
      <SettingsModal
        status={{ configured: true, provider: "openrouter", model: "openai/gpt-5" }}
        fontScale={1}
        onClose={vi.fn()}
        onSave={vi.fn(async () => {})}
        onFontScaleChange={vi.fn()}
      />,
    )

    const model = screen.getByLabelText("모델 ID")
    expect(model).toHaveValue("z-ai/glm-5.3-flash")
    await userEvent.selectOptions(model, "deepseek/deepseek-v4-flash-0731")
    expect(model).toHaveValue("deepseek/deepseek-v4-flash-0731")
  })

  it("changes the persisted UI font scale", async () => {
    const onFontScaleChange = vi.fn()
    render(
      <SettingsModal
        status={{ configured: false, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        fontScale={1}
        onClose={vi.fn()}
        onSave={vi.fn(async () => {})}
        onFontScaleChange={onFontScaleChange}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText("글자 크기"), "0.9")

    expect(onFontScaleChange).toHaveBeenCalledWith(0.9)
  })

  it("connects to local OpenCodex without requesting an API key", async () => {
    const onSave = vi.fn(async () => {})
    const onThemeChange = vi.fn()
    render(
      <SettingsModal
        status={{ configured: false, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        fontScale={1}
        theme="system"
        onClose={vi.fn()}
        onSave={onSave}
        onFontScaleChange={vi.fn()}
        onThemeChange={onThemeChange}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText("Provider"), "opencodex")
    expect(screen.queryByLabelText("API 키")).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText("화면 모드"), "dark")
    await userEvent.click(screen.getByRole("button", { name: "암호화하여 저장" }))

    expect(onThemeChange).toHaveBeenCalledWith("dark")
    expect(onSave).toHaveBeenCalledWith({ provider: "opencodex", model: "gpt-5.6-sol" })
  })
})
