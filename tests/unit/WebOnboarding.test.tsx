import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WebOnboarding } from "../../src/web/WebOnboarding"

const status = {
  configured: true,
  provider: "openrouter",
  model: "deepseek/deepseek-v4.1-flash",
  mode: "api",
} as const

const mocks = vi.hoisted(() => ({
  codexStatus: vi.fn(async () => ({
    available: true,
    authenticated: false,
    account: null,
    requiresOpenaiAuth: false,
  })),
  startLogin: vi.fn(async () => ({
    type: "chatgpt" as const,
    loginId: "login-1",
    authUrl: "https://auth.openai.com/example",
  })),
  cancelLogin: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
  onLoginCompleted: vi.fn(() => () => {}),
  providerStatus: vi.fn(async () => ({ ...status })),
  saveProviderConfig: vi.fn(async () => ({ ...status })),
  saveAiMode: vi.fn(async () => ({ ...status })),
  openExternal: vi.fn(async () => {}),
  claudeStatus: vi.fn(async () => ({
    available: true,
    authenticated: true,
    email: "reader@example.test",
    subscriptionType: "max",
    loginPending: false,
    loginUrl: null,
  })),
  claudeStartLogin: vi.fn(),
  claudeCancelLogin: vi.fn(),
}))

function installApi(): void {
  Object.defineProperty(window, "ohmypaper", {
    value: {
      codex: {
        getStatus: mocks.codexStatus,
        startLogin: mocks.startLogin,
        cancelLogin: mocks.cancelLogin,
        logout: mocks.logout,
        onLoginCompleted: mocks.onLoginCompleted,
      },
      providerStatus: mocks.providerStatus,
      saveProviderConfig: mocks.saveProviderConfig,
      saveAiMode: mocks.saveAiMode,
      openExternal: mocks.openExternal,
    },
    configurable: true,
  })
}

function installClaudeApi(): void {
  installApi()
  Object.assign(window.ohmypaper, {
    claude: {
      getStatus: mocks.claudeStatus,
      startLogin: mocks.claudeStartLogin,
      cancelLogin: mocks.claudeCancelLogin,
    },
  })
}

const providerStatusProp = {
  configured: false,
  provider: "openrouter",
  model: "deepseek/deepseek-v4.1-flash",
} as const

describe("WebOnboarding", () => {
  beforeEach(() => {
    installApi()
    vi.clearAllMocks()
  })

  it("walks from welcome to connect choices in two clicks", async () => {
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "oh-my-paper" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }))

    expect(screen.getByRole("button", { name: /ChatGPT 구독/ })).toBeVisible()
    expect(screen.getByRole("button", { name: /^API 키 OpenRouter/ })).toBeVisible()
  })

  it("recommends Claude and connects an existing Claude Code login with Haiku 4.5", async () => {
    installClaudeApi()
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "시작하기" }))
    fireEvent.click(screen.getByRole("button", { name: /Claude 구독 권장/ }))

    await waitFor(() =>
      expect(mocks.saveAiMode).toHaveBeenCalledWith({
        mode: "claude",
        claudeModel: "claude-haiku-4-5",
        claudeEffort: "medium",
      }),
    )
    expect(await screen.findByText(/Claude 구독 연결됨/)).toBeVisible()
    expect(mocks.claudeStartLogin).not.toHaveBeenCalled()
  })

  it("saves an API key and finishes through the done step", async () => {
    const onDone = vi.fn()
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={onDone} />)

    fireEvent.click(screen.getByRole("button", { name: "시작하기" }))
    fireEvent.click(screen.getByRole("button", { name: /^API 키 OpenRouter/ }))
    fireEvent.change(screen.getByLabelText("OpenRouter API 키"), {
      target: { value: "sk-or-test-key-1234567890" },
    })
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }))

    await waitFor(() =>
      expect(mocks.saveProviderConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openrouter",
          model: "deepseek/deepseek-v4.1-flash",
          pageTranslationModel: "tencent/hy-mt2-30b-a3b",
        }),
      ),
    )
    expect(mocks.saveAiMode).toHaveBeenCalledWith(expect.objectContaining({ mode: "api" }))
    await screen.findByRole("button", { name: "라이브러리 열기" })
    fireEvent.click(screen.getByRole("button", { name: "라이브러리 열기" }))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ configured: true }))
  })

  it("starts ChatGPT login immediately when the subscription card is chosen", async () => {
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "시작하기" }))
    fireEvent.click(screen.getByRole("button", { name: /ChatGPT 구독/ }))

    await waitFor(() => expect(mocks.startLogin).toHaveBeenCalledWith("chatgpt"))
    await waitFor(() => expect(mocks.openExternal).toHaveBeenCalled())
    expect(await screen.findByText(/브라우저에서 ChatGPT 승인을 완료하세요/)).toBeVisible()
    expect(mocks.saveAiMode).not.toHaveBeenCalled()
  })
})
