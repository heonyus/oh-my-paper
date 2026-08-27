import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AiChatPanel } from "../../src/renderer/components/AiChatPanel"

describe("AiChatPanel", () => {
  it("sends an explicit paper question and renders the answer", async () => {
    const onAsk = vi.fn(async () => "이 논문의 핵심 기여는 장기 EHR 추론입니다.")
    render(
      <AiChatPanel
        page={3}
        provider={{ configured: true, provider: "openrouter", model: "openai/gpt-5" }}
        onClose={vi.fn()}
        onAsk={onAsk}
      />,
    )

    await userEvent.type(screen.getByRole("textbox", { name: "논문 질문" }), "핵심 기여가 뭐야?")
    await userEvent.click(screen.getByRole("button", { name: "보내기" }))

    expect(onAsk).toHaveBeenCalledWith("핵심 기여가 뭐야?", [])
    expect(await screen.findByText("이 논문의 핵심 기여는 장기 EHR 추론입니다.")).toBeVisible()
  })
})
