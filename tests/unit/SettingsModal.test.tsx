import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SettingsModal } from "../../src/renderer/components/SettingsModal"

describe("SettingsModal", () => {
  it("closes through the native Escape cancel event", () => {
    const onClose = vi.fn()
    render(
      <SettingsModal
        status={{ configured: false, provider: "openai", model: "gpt-5" }}
        fontScale={1}
        onClose={onClose}
        onSave={vi.fn(async () => {})}
        onFontScaleChange={vi.fn()}
      />,
    )
    fireEvent(screen.getByRole("dialog", { name: "설정" }), new Event("cancel"))
    expect(onClose).toHaveBeenCalledOnce()
  })

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

    expect(screen.getByLabelText("모델 ID")).toHaveValue("google/gemini-2.5-flash-lite")
    expect(screen.queryByText(/ChatGPT Plus/)).not.toBeInTheDocument()
    expect(onSave).toHaveBeenCalledWith({
      provider: "openrouter",
      apiKey: "sk-or-example-key-at-least-twenty-characters",
      model: "google/gemini-2.5-flash-lite",
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
    expect(model).toHaveValue("google/gemini-2.5-flash-lite")
    await userEvent.selectOptions(model, "deepseek/deepseek-v4.1-flash")
    expect(model).toHaveValue("deepseek/deepseek-v4.1-flash")
  })

  it("saves Gemini Flash-Lite as a first-class provider", async () => {
    const onSave = vi.fn(async () => {})
    render(
      <SettingsModal
        status={{ configured: false, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        fontScale={1}
        onClose={vi.fn()}
        onSave={onSave}
        onFontScaleChange={vi.fn()}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText("Provider"), "gemini")
    await userEvent.type(
      screen.getByLabelText("API 키"),
      "gemini-example-key-at-least-twenty-characters",
    )
    await userEvent.click(screen.getByRole("button", { name: "암호화하여 저장" }))

    expect(onSave).toHaveBeenCalledWith({
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      apiKey: "gemini-example-key-at-least-twenty-characters",
    })
  })

  it("shows local Paddle readiness without requesting an OCR key", () => {
    render(
      <SettingsModal
        status={{ configured: true, provider: "gemini", model: "gemini-3.5-flash-lite" }}
        ocrStatus={{ configured: false, provider: "paddle", model: "PaddleOCR-VL-1.6" }}
        fontScale={1}
        onClose={vi.fn()}
        onSave={vi.fn(async () => {})}
        onFontScaleChange={vi.fn()}
      />,
    )

    expect(screen.getByText("PaddleOCR-VL-1.6")).toBeVisible()
    expect(screen.getByText("로컬 런타임 설치 필요")).toBeVisible()
    expect(screen.queryByLabelText(/OCR API 키/)).not.toBeInTheDocument()
  })

  it("locks first run to OpenRouter setup only", async () => {
    const onSave = vi.fn(async () => {})
    const onModeSave = vi.fn(async () => {})
    render(
      <SettingsModal
        status={{ configured: false, provider: "openrouter", model: "qwen/qwen3.7-flash" }}
        ocrStatus={{ configured: false, provider: "paddle", model: "PaddleOCR-VL-1.6" }}
        fontScale={1}
        locked
        openRouterRequired
        onClose={vi.fn()}
        onSave={onSave}
        onModeSave={onModeSave}
        onFontScaleChange={vi.fn()}
      />,
    )

    expect(screen.getByText("OpenRouter API 키 설정 필요")).toBeVisible()
    expect(screen.getByLabelText("OpenRouter API 키")).toBeVisible()
    expect(screen.queryByLabelText(/OCR API 키/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "설정 닫기" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "OpenRouter 설정 저장" })).toBeDisabled()

    await userEvent.type(
      screen.getByLabelText("OpenRouter API 키"),
      "sk-or-user-owned-key-at-least-twenty-characters",
    )
    await userEvent.click(screen.getByRole("button", { name: "OpenRouter 설정 저장" }))
    expect(await screen.findByText("저장됨")).toBeVisible()
    expect(onSave).toHaveBeenCalledOnce()
    expect(onModeSave).not.toHaveBeenCalled()
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

    await userEvent.click(screen.getByRole("button", { name: "일반" }))
    await userEvent.click(screen.getByRole("button", { name: "75%" }))

    expect(onFontScaleChange).toHaveBeenCalledWith(0.75)
    expect(screen.queryByRole("button", { name: "100%로 초기화" })).not.toBeInTheDocument()
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

    await userEvent.click(screen.getByRole("button", { name: "AI 모델" }))
    await userEvent.selectOptions(screen.getByLabelText("Provider"), "opencodex")
    expect(screen.queryByLabelText("API 키")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "일반" }))
    await userEvent.selectOptions(screen.getByLabelText("화면 모드"), "dark")
    await userEvent.click(screen.getByRole("button", { name: "AI 모델" }))
    await userEvent.click(screen.getByRole("button", { name: "암호화하여 저장" }))

    expect(onThemeChange).toHaveBeenCalledWith("dark")
    expect(onSave).toHaveBeenCalledWith({ provider: "opencodex", model: "gpt-5.6-sol" })
  })

  it("separates reading preferences in a source-list section", async () => {
    const onMinimapVisibleChange = vi.fn()
    render(
      <SettingsModal
        status={{ configured: true, provider: "openrouter", model: "z-ai/glm-5.3-flash" }}
        fontScale={1}
        minimapVisible={true}
        onClose={vi.fn()}
        onSave={vi.fn(async () => {})}
        onFontScaleChange={vi.fn()}
        onMinimapVisibleChange={onMinimapVisibleChange}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "읽기" }))
    await userEvent.click(screen.getByRole("checkbox", { name: "미니맵 표시" }))

    expect(onMinimapVisibleChange).toHaveBeenCalledWith(false)
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument()
  })

  it("keeps hosted credentials out of the web appearance-only settings", () => {
    render(
      <SettingsModal
        status={{ configured: true, provider: "gemini", model: "gemini-3.5-flash-lite" }}
        fontScale={1}
        appearanceOnly={true}
        onClose={vi.fn()}
        onSave={vi.fn(async () => {})}
        onFontScaleChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "일반" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "AI 모델" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("API 키")).not.toBeInTheDocument()
  })
})
