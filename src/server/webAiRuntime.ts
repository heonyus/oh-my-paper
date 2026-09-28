import { type AiModeSettings, AiModeStore } from "../electron/aiModeStore"
import { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"
import { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import { DEFAULT_CLAUDE_EFFORT, DEFAULT_CLAUDE_MODEL } from "../shared/claudeTypes"
import type { ProviderConfig } from "../shared/ipc"
import { isOpenRouterModel } from "../shared/providerModels"
import { WebAiService } from "./aiService"
import type { WebServerConfig } from "./config"
import { LocalCredentialStore } from "./localCredentialStore"

export type WebAiRuntime = {
  readonly credentials: LocalCredentialStore
  readonly subscription: CodexSubscriptionAdapter
  readonly claude: ClaudeSubscriptionAdapter
  readonly aiModes: AiModeStore
  readonly initialProvider: ProviderConfig | null
  readonly ai: WebAiService
}

/** Without a saved choice, prefer the local Claude Code subscription whenever its CLI exists. */
function initialMode(provider: ProviderConfig | null, claudeInstalled: boolean): AiModeSettings {
  return {
    mode: claudeInstalled ? "claude" : provider ? "api" : "chatgpt",
    codexModel: "gpt-5.6-sol",
    codexReasoningEffort: "medium",
    claudeModel: DEFAULT_CLAUDE_MODEL,
    claudeEffort: DEFAULT_CLAUDE_EFFORT,
  }
}

export async function createWebAiRuntime(config: WebServerConfig): Promise<WebAiRuntime> {
  const environmentOpenRouter =
    config.provider === "openrouter" &&
    config.model &&
    isOpenRouterModel(config.model) &&
    config.apiKeys.openrouter
      ? { provider: "openrouter" as const, apiKey: config.apiKeys.openrouter, model: config.model }
      : null
  const environmentOpenAi =
    config.provider === "openai" && config.apiKeys.openai
      ? {
          provider: "openai" as const,
          apiKey: config.apiKeys.openai,
          model: config.model ?? "gpt-4.1-mini",
        }
      : null
  const environmentGemini =
    config.provider === "gemini" && config.apiKeys.gemini
      ? {
          provider: "gemini" as const,
          apiKey: config.apiKeys.gemini,
          model: config.model ?? "gemini-3.5-flash-lite",
        }
      : null
  const environmentGroq =
    config.provider === "groq" && config.apiKeys.groq
      ? {
          provider: "groq" as const,
          apiKey: config.apiKeys.groq,
          model: config.model ?? "openai/gpt-oss-20b",
        }
      : null
  const credentials = await LocalCredentialStore.open(config.dataDir, {
    openrouter: environmentOpenRouter,
    ...(environmentOpenAi ? { openai: environmentOpenAi } : {}),
    ...(environmentGemini ? { gemini: environmentGemini } : {}),
    ...(environmentGroq ? { groq: environmentGroq } : {}),
  })
  const subscription = new CodexSubscriptionAdapter({ appRoot: config.dataDir })
  const claude = new ClaudeSubscriptionAdapter({ appRoot: config.dataDir })
  const aiModes = new AiModeStore(config.dataDir)
  const initialProvider = credentials.providerConfig()
  const savedMode = await aiModes.hasSavedSettings()
  const modeSettings = savedMode
    ? await aiModes.loadSettings()
    : initialMode(initialProvider, claude.isAvailable)
  return {
    credentials,
    subscription,
    claude,
    aiModes,
    initialProvider,
    ai: new WebAiService(initialProvider, subscription, modeSettings, claude),
  }
}
