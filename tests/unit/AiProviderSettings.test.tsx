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
  model: "google/gemini-3.1-flash-lite",
  mode: "chatgpt",
}

function Harness({
  onModeSave,
  claudeAvailable = false,
}: {
  readonly onModeSave: (mode: "api" | "chatgpt" | "claude") => Promise<void>
  readonly claudeAvailable?: boolean
}) {
  const form = useAiProviderForm(status)
  return (
    <AiProviderSettings
      form={form}
      onSave={vi.fn(async () => {})}
      onModeSave={onModeSave}
      claudeAvailable={claudeAvailable}
    />
  )
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

  it("offers Claude only when the local server provides it", async () => {
    const onModeSave = vi.fn(async () => {})
    const { unmount } = render(<Harness onModeSave={onModeSave} />)
    expect(screen.queryByRole("option", { name: "Claude 구독" })).toBeNull()
    unmount()

    render(<Harness onModeSave={onModeSave} claudeAvailable />)
    await userEvent.selectOptions(screen.getByLabelText("AI 접근 방식"), "claude")

    await waitFor(() => expect(onModeSave).toHaveBeenCalledWith("claude"))
    expect(screen.getByText(/Claude 연결 상태를 확인하세요/)).toBeVisible()
  })
})
