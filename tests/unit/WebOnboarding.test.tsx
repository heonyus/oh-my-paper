import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "../../src/renderer/lib/locale"
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
  listModels: vi.fn(async () => [
    {
      id: "gpt-7-nova",
      label: "GPT-7 Nova",
      description: "",
      isDefault: true,
      efforts: ["low", "medium"],
    },
  ]),
  cancelLogin: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
  onLoginCompleted: vi.fn(
    (_listener: (event: { loginId: string; success: boolean; error: string }) => void) => () => {},
  ),
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
        listModels: mocks.listModels,
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
    mocks.codexStatus.mockResolvedValue({
      available: true,
      authenticated: false,
      account: null,
      requiresOpenaiAuth: false,
    })
  })

  it("shows the connect choices on the first screen", async () => {
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "oh-my-paper" })).toBeVisible()
    expect(screen.getByRole("button", { name: /ChatGPT 구독.*GPT-6 Luna/ })).toBeVisible()
    expect(screen.getByRole("button", { name: /^API 키 OpenRouter/ })).toBeVisible()
    expect(screen.queryByRole("button", { name: /Claude 구독/ })).toBeNull()
  })

  it("speaks English when the reader picked it", async () => {
    const saved = new Map([["ohmypaper:language", "en"]])
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    })
    try {
      render(
        <LocaleProvider>
          <WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />
        </LocaleProvider>,
      )

      expect(screen.getByRole("heading", { name: "Connect an AI" })).toBeVisible()
      expect(screen.getByRole("button", { name: /ChatGPT subscription.*GPT-6 Luna/ })).toBeVisible()
      expect(document.documentElement.lang).toBe("en")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("connects an existing Claude Code login with Haiku 4.5", async () => {
    installClaudeApi()
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /Claude 구독.*Haiku 4\.5/ }))

    await waitFor(() =>
      expect(mocks.saveAiMode).toHaveBeenCalledWith({
        mode: "claude",
        claudeModel: "claude-haiku-4-5",
        claudeEffort: "medium",
      }),
    )
    expect(await screen.findByText(/Claude 구독 연결됨/)).toBeVisible()
    expect(screen.getByText("문장을 고르고 한 키로")).toBeVisible()
    expect(mocks.claudeStartLogin).not.toHaveBeenCalled()
  })

  it("saves an API key and finishes through the done step", async () => {
    const onDone = vi.fn()
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={onDone} />)

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
    await screen.findByRole("button", { name: "시작하기" })
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ configured: true }))
  })

  it("starts ChatGPT login immediately when the subscription card is chosen", async () => {
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /ChatGPT 구독/ }))

    await waitFor(() => expect(mocks.startLogin).toHaveBeenCalledWith("chatgpt"))
    await waitFor(() => expect(mocks.openExternal).toHaveBeenCalled())
    expect(await screen.findByText(/브라우저에서 ChatGPT 승인을 완료하세요/)).toBeVisible()
    expect(mocks.saveAiMode).not.toHaveBeenCalled()
  })

  it("starts an already signed-in ChatGPT account on the runtime's default model", async () => {
    mocks.codexStatus.mockResolvedValue({
      available: true,
      authenticated: true,
      account: null,
      requiresOpenaiAuth: false,
    })
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /ChatGPT 구독/ }))

    await waitFor(() =>
      expect(mocks.saveAiMode).toHaveBeenCalledWith({
        mode: "chatgpt",
        codexModel: "gpt-7-nova",
        codexReasoningEffort: "medium",
      }),
    )
    expect(await screen.findByText(/ChatGPT 구독 연결됨/)).toBeVisible()
    expect(mocks.startLogin).not.toHaveBeenCalled()
  })

  it("stays on the login step when a ChatGPT sign-in fails", async () => {
    let complete: (event: { loginId: string; success: boolean; error: string }) => void = () => {}
    mocks.onLoginCompleted.mockImplementation((listener) => {
      complete = listener
      return () => {}
    })
    render(<WebOnboarding status={{ ...providerStatusProp }} onDone={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /ChatGPT 구독/ }))
    await waitFor(() => expect(mocks.startLogin).toHaveBeenCalled())
    await screen.findByText(/브라우저에서 ChatGPT 승인을 완료하세요/)
    complete({ loginId: "login-1", success: false, error: "access_denied" })

    expect(await screen.findByText("access_denied")).toBeVisible()
    expect(mocks.saveAiMode).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "시작하기" })).toBeNull()
  })

  it("opens on the ready step when the terminal wizard already connected AI", () => {
    const onDone = vi.fn()
    const connected = { ...providerStatusProp, configured: true, mode: "claude" } as const
    render(<WebOnboarding status={connected} onDone={onDone} />)

    expect(screen.getByRole("heading", { name: "준비됐습니다" })).toBeVisible()
    expect(screen.getByText(/Claude 구독 연결됨/)).toBeVisible()
    expect(screen.queryByText("AI를 연결하세요")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }))
    expect(onDone).toHaveBeenCalledWith(connected)
  })
})
