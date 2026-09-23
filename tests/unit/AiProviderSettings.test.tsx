import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  AiProviderSettings,
  useAiProviderForm,
} from "../../src/renderer/components/AiProviderSettings"
import type { ProviderStatus } from "../../src/shared/ipc"

const status: ProviderStatus = {
  configured: false,
  provider: "openrouter",
  model: "google/gemini-2.5-flash-lite",
  mode: "chatgpt",
}

function Harness({
  onModeSave,
}: {
  readonly onModeSave: (mode: "api" | "chatgpt") => Promise<void>
}) {
  const form = useAiProviderForm(status)
  return <AiProviderSettings form={form} onSave={vi.fn(async () => {})} onModeSave={onModeSave} />
}

describe("AiProviderSettings", () => {
  it("shows a mode-save failure and restores the previous mode", async () => {
    const onModeSave = vi.fn(async () => {
      throw new Error("provider mode unavailable")
    })
    render(<Harness onModeSave={onModeSave} />)

    const mode = screen.getByLabelText("AI 접근 방식")
    await userEvent.selectOptions(mode, "api")

    await waitFor(() =>
      expect(screen.getByText(/저장 실패: provider mode unavailable/)).toBeVisible(),
    )
    expect(mode).toHaveValue("chatgpt")
    expect(onModeSave).toHaveBeenCalledWith("api")
  })
})
