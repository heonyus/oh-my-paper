import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { HostedCredentialSettings } from "../../src/renderer/components/HostedCredentialSettings"

describe("HostedCredentialSettings", () => {
  it("shows independent masked key rows and saves the selected user's Groq key", async () => {
    const onSave = vi.fn(async () => {})
    render(
      <HostedCredentialSettings
        status={{
          providers: {
            gemini: { source: "shared", model: "gemini-3.5-flash-lite" },
            groq: { source: "personal", model: "openai/gpt-oss-20b" },
          },
          preferredTextProvider: "gemini",
        }}
        onSave={onSave}
      />,
    )

    expect(screen.getByText("공용 키 사용 중 · 기본")).toBeVisible()
    expect(screen.getByText("내 키 연결됨")).toBeVisible()
    const key = screen.getByLabelText("Groq API 키")
    expect(key).toHaveAttribute("type", "password")
    await userEvent.type(key, "gsk_example-key-that-is-long-enough")
    await userEvent.click(screen.getByRole("button", { name: "Groq 저장하고 기본으로 사용" }))

    expect(onSave).toHaveBeenCalledWith({
      provider: "groq",
      apiKey: "gsk_example-key-that-is-long-enough",
      model: "openai/gpt-oss-20b",
    })
    expect(key).toHaveValue("")
  })
})
