import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CodexSettings } from "../../src/renderer/components/CodexSettings"
import type {
  CodexAccountStatus,
  CodexLoginCompletedEvent,
  CodexLoginStartResult,
} from "../../src/shared/codexTypes"

type LoginListener = (event: CodexLoginCompletedEvent) => void

const availableStatus: CodexAccountStatus = {
  available: true,
  authenticated: false,
  account: null,
  requiresOpenaiAuth: true,
}

function installApi() {
  let loginListener: LoginListener | null = null
  const startResult: CodexLoginStartResult = {
    type: "chatgpt",
    loginId: "login-current",
    authUrl: "https://auth.example.test/login",
  }
  const api = {
    codex: {
      getStatus: vi.fn(async () => availableStatus),
      startLogin: vi.fn(async () => startResult),
      cancelLogin: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
      onLoginCompleted: vi.fn((listener: LoginListener) => {
        loginListener = listener
        return () => {
          if (loginListener === listener) loginListener = null
        }
      }),
    },
    providerStatus: vi.fn(async () => ({
      configured: false,
      provider: "openrouter" as const,
      model: "google/gemini-2.5-flash-lite",
      mode: "chatgpt" as const,
      codexModel: "gpt-5.6-sol",
      codexReasoningEffort: "medium" as const,
    })),
    openExternal: vi.fn(async () => {
      throw new Error("popup blocked")
    }),
    saveAiMode: vi.fn(async () => {}),
  }
  Object.defineProperty(window, "ohmypaper", { configurable: true, value: api })
  return {
    api,
    emit(event: CodexLoginCompletedEvent): void {
      loginListener?.(event)
    },
  }
}

afterEach(() => {
  Object.defineProperty(window, "ohmypaper", { configurable: true, value: undefined })
})

describe("CodexSettings", () => {
  it("keeps a pending login visible and exposes the auth link when a popup is blocked", async () => {
    const harness = installApi()
    render(<CodexSettings />)

    await waitFor(() => expect(screen.getByText("로그인 필요")).toBeVisible())
    await userEvent.click(screen.getByRole("button", { name: "ChatGPT로 로그인" }))

    const link = await screen.findByRole("link", { name: "로그인 페이지 다시 열기" })
    expect(link).toHaveAttribute("href", "https://auth.example.test/login")
    expect(screen.getByText(/자동으로 열지 못했습니다/)).toBeVisible()
    expect(screen.getByText("로그인 진행 중…")).toBeVisible()

    await act(async () => {
      harness.emit({ loginId: "login-old", success: true })
    })
    expect(screen.getByText("로그인 진행 중…")).toBeVisible()

    await act(async () => {
      harness.emit({ loginId: "login-current", success: false, error: "승인 취소됨" })
    })
    await waitFor(() => expect(screen.getByText("승인 취소됨")).toBeVisible())
    expect(screen.queryByText("로그인 진행 중…")).not.toBeInTheDocument()
    expect(harness.api.codex.startLogin).toHaveBeenCalledWith("chatgpt")
  })

  it("cancels the active login without changing the unauthenticated state", async () => {
    const harness = installApi()
    render(<CodexSettings />)

    await waitFor(() => expect(screen.getByText("로그인 필요")).toBeVisible())
    await userEvent.click(screen.getByRole("button", { name: "기기 코드로 로그인" }))
    await screen.findByRole("button", { name: "로그인 취소" })
    await userEvent.click(screen.getByRole("button", { name: "로그인 취소" }))

    await waitFor(() => expect(screen.getByText("로그인 취소됨")).toBeVisible())
    expect(screen.getByText("로그인 필요")).toBeVisible()
    expect(harness.api.codex.cancelLogin).toHaveBeenCalledWith("login-current")
  })
})
