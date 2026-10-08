import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AiProviderSettings,
  useAiProviderForm,
} from "../../src/renderer/components/AiProviderSettings"
import { ClaudeSettings } from "../../src/renderer/components/ClaudeSettings"
import { CodexSettings } from "../../src/renderer/components/CodexSettings"
import { DocumentOcrSettings } from "../../src/renderer/components/DocumentOcrSettings"
import { HostedCredentialSettings } from "../../src/renderer/components/HostedCredentialSettings"
import { LocalAiPanel } from "../../src/renderer/components/localAi/LocalAiPanel"
import { SettingsModal } from "../../src/renderer/components/SettingsModal"
import { SubscriptionUsage } from "../../src/renderer/components/SubscriptionUsage"
import { LocaleProvider } from "../../src/renderer/lib/locale"
import { localAiMessages } from "../../src/renderer/messages/localAi"
import { settingsMessages } from "../../src/renderer/messages/settings"
import { subscriptionMessages } from "../../src/renderer/messages/subscription"
import { CLAUDE_EFFORT_OPTIONS, claudeModelChoices } from "../../src/shared/claudeTypes"
import {
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_EFFORT_OPTIONS,
  codexModelChoices,
  codexModelHint,
} from "../../src/shared/codexTypes"
import { LOCALES } from "../../src/shared/i18n/locale"
import type { ProviderStatus } from "../../src/shared/ipc"
import { buildDeterministicWritingSuggestions } from "../../src/shared/localInference"
import { uiFontOptions, uiFontScaleLabel } from "../../src/shared/uiAppearance"
import { expectCompleteCatalog } from "../support/i18nCatalog"

function english(children: ReactNode) {
  return render(<LocaleProvider initialPreference="en">{children}</LocaleProvider>)
}

afterEach(() => {
  Object.defineProperty(window, "ohmypaper", { configurable: true, value: undefined })
})

describe("settings wording", () => {
  it("has every message in both languages with matching placeholders", () => {
    expectCompleteCatalog(settingsMessages)
    expectCompleteCatalog(subscriptionMessages)
    expectCompleteCatalog(localAiMessages)
  })

  it("labels every shared choice in both languages", () => {
    const tables = [
      ...CODEX_REASONING_EFFORT_OPTIONS.map((option) => option.label),
      ...CLAUDE_EFFORT_OPTIONS.map((option) => option.label),
      ...uiFontOptions.map((option) => option.label),
    ]
    for (const label of tables) {
      for (const locale of LOCALES) expect(label[locale].trim()).not.toBe("")
    }
    for (const model of CODEX_MODEL_OPTIONS) {
      expect(codexModelHint(model.id, "ko")).toBe(model.description)
      expect(codexModelHint(model.id, "en")).not.toMatch(/[가-힣]/)
    }
  })

  it("keeps the Korean labels and speaks English on request", () => {
    expect(uiFontScaleLabel(1)).toBe("기본")
    expect(uiFontScaleLabel(1.5, "en")).toBe("Extra large")
    expect(uiFontScaleLabel(2, "en")).toBe("Largest")
    expect(claudeModelChoices("claude-old", "en").at(-1)?.label).toBe("claude-old (saved model)")
    expect(codexModelChoices(CODEX_MODEL_OPTIONS, "gpt-old", "en").at(-1)?.description).toBe(
      "Saved model",
    )
    expect(buildDeterministicWritingSuggestions({ title: "", body: "" }, "en")).toEqual([
      "State the core claim in one sentence.",
      "Link the source passages that support it.",
      "If the comparison conditions are not known, leave them as unknown.",
    ])
  })
})

describe("settings in English", () => {
  it("shows the dialog, its sections and the API form in English", async () => {
    english(
      <SettingsModal
        status={{ configured: false, provider: "openai", model: "gpt-5" }}
        fontScale={1}
        onClose={vi.fn()}
        onSave={vi.fn(async () => {})}
        onFontScaleChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "AI models" })).toBeVisible()
    expect(screen.getByText("AI connection needs setup")).toBeVisible()
    expect(screen.getByLabelText("AI access")).toHaveDisplayValue(
      "API key or local connection (advanced)",
    )
    expect(screen.getByLabelText("Model ID")).toBeVisible()
    expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "API key")
    expect(screen.getByRole("button", { name: "Encrypt and save" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Close settings" })).toBeVisible()

    await userEvent.click(screen.getByRole("button", { name: "General" }))
    expect(screen.getByText("General preferences")).toBeVisible()
    expect(screen.getByLabelText("Appearance")).toHaveDisplayValue("System setting")
    expect(screen.getByText("Default")).toBeVisible()
    expect(screen.getByRole("group", { name: "Text size presets" })).toBeVisible()

    await userEvent.click(screen.getByRole("button", { name: "Reading" }))
    expect(screen.getByRole("combobox", { name: /^Translation font/ })).toHaveDisplayValue(
      "Match the original",
    )
    expect(screen.getByText(/serif for body text, sans-serif for headings/)).toBeVisible()
    expect(screen.getByRole("checkbox", { name: "Show minimap" })).toBeChecked()
  })

  it("marks an English save failure as an error", async () => {
    const status: ProviderStatus = {
      configured: false,
      provider: "openrouter",
      model: "google/gemini-3.1-flash-lite",
      mode: "chatgpt",
    }
    function Harness() {
      const form = useAiProviderForm(status)
      return (
        <AiProviderSettings
          form={form}
          onSave={vi.fn(async () => {})}
          onModeSave={async () => {
            throw new Error("provider mode unavailable")
          }}
        />
      )
    }
    english(<Harness />)

    await userEvent.selectOptions(screen.getByLabelText("AI access"), "api")

    const failure = await screen.findByText(/Save failed: provider mode unavailable/)
    expect(failure).toHaveAttribute("data-error", "true")
  })

  it("names the ChatGPT connection, its models and its failures in English", async () => {
    const api = {
      codex: {
        getStatus: vi.fn(async () => ({
          available: true,
          authenticated: false,
          account: null,
          requiresOpenaiAuth: true,
        })),
        startLogin: vi.fn(async () => ({
          type: "chatgpt" as const,
          loginId: "login-1",
          authUrl: "https://auth.example.test/login",
        })),
        cancelLogin: vi.fn(async () => {}),
        logout: vi.fn(async () => {}),
        onLoginCompleted: vi.fn(() => () => {}),
      },
      providerStatus: vi.fn(async () => ({
        configured: false,
        provider: "openrouter" as const,
        model: "google/gemini-3.1-flash-lite",
        mode: "chatgpt" as const,
        codexModel: "gpt-6-luna",
        codexReasoningEffort: "medium" as const,
      })),
      openExternal: vi.fn(async () => {
        throw new Error("popup blocked")
      }),
      saveAiMode: vi.fn(async () => {}),
    }
    Object.defineProperty(window, "ohmypaper", { configurable: true, value: api })
    english(<CodexSettings />)

    await waitFor(() => expect(screen.getByText("Sign-in needed")).toBeVisible())
    expect(screen.getByLabelText("Subscription model")).toHaveDisplayValue(
      "GPT-6 Luna — Latest · fast and light",
    )
    expect(screen.getByLabelText("Reasoning effort")).toHaveDisplayValue("medium (default)")

    await userEvent.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }))

    expect(await screen.findByRole("link", { name: "Reopen the sign-in page" })).toBeVisible()
    const failure = screen.getByText("Could not open the browser automatically: popup blocked")
    expect(failure.closest(".settings-alert-banner")).toHaveAttribute("data-variant", "error")
  })

  it("names the Claude connection and its choices in English", async () => {
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: {
        claude: {
          getStatus: vi.fn(async () => ({
            available: false,
            authenticated: false,
            email: null,
            subscriptionType: null,
            loginPending: false,
            loginUrl: null,
          })),
          startLogin: vi.fn(),
          cancelLogin: vi.fn(),
        },
        providerStatus: vi.fn(async () => ({
          configured: false,
          provider: "openrouter" as const,
          model: "google/gemini-3.1-flash-lite",
        })),
        saveAiMode: vi.fn(async () => {}),
      },
    })
    english(<ClaudeSettings />)

    await waitFor(() => expect(screen.getByText("Sign-in needed")).toBeVisible())
    expect(screen.getByLabelText("Claude model")).toHaveDisplayValue("Claude Haiku 5.5 (default)")
    expect(screen.getByLabelText("Claude reasoning effort")).toHaveDisplayValue("Medium (default)")
    expect(
      screen.getByText("The Claude Code CLI was not found. Install it, then refresh the status."),
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Refresh status" })).toBeVisible()
  })

  it("reports usage, OCR, hosted keys and local suggestions in English", () => {
    english(
      <>
        <SubscriptionUsage
          status={{
            available: true,
            authenticated: true,
            account: { type: "chatgpt", email: null, planType: "plus" },
            requiresOpenaiAuth: true,
            rateLimits: {
              rateLimits: { primary: { usedPercent: 30 }, secondary: null },
            },
          }}
        />
        <DocumentOcrSettings
          status={{
            configured: false,
            provider: "paddle",
            model: "PaddleOCR-VL-1.6",
            acceleration: null,
            installing: true,
            installProgress: { percent: 42, etaSeconds: 150 },
          }}
          analysis={{ analysed: 2, total: 3 }}
        />
        <HostedCredentialSettings
          status={{
            providers: {
              gemini: { source: "shared", model: "gemini-3.5-flash-lite" },
              groq: { source: "personal", model: "openai/gpt-oss-20b" },
            },
            preferredTextProvider: "gemini",
          }}
          onSave={vi.fn(async () => {})}
        />
        <LocalAiPanel api={null} nodeTitle="Attention" draft="" imeComposing={false} />
      </>,
    )

    const usage = screen.getByRole("group", { name: "Subscription usage" })
    expect(within(usage).getByText("Plan: plus")).toBeVisible()
    expect(within(usage).getByText("Account limit")).toBeVisible()
    expect(within(usage).getByText("Short-term · 70% left")).toBeVisible()

    expect(screen.getByText("Installing 42% · about 3 min left")).toBeVisible()
    expect(screen.getByRole("progressbar", { name: "OCR engine install progress" })).toBeVisible()
    expect(screen.getByText("2 of 3 papers done")).toBeVisible()

    expect(screen.getByText("Using the shared key · default")).toBeVisible()
    expect(screen.getByText("Your key connected")).toBeVisible()
    expect(screen.getByLabelText("Groq API key")).toHaveAttribute("type", "password")
    expect(screen.getByRole("button", { name: "Save Groq and use it by default" })).toBeVisible()

    expect(screen.getByRole("heading", { name: "Local writing suggestions" })).toBeVisible()
    expect(
      screen.getByText("The local inference API is not connected in this build."),
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Turn on local suggestions" })).toBeDisabled()
  })
})
