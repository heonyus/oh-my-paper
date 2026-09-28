import type { z } from "zod"
import type { AiModeSettings, AiModeStore } from "../electron/aiModeStore"
import type { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"
import type { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import { DEFAULT_CLAUDE_EFFORT } from "../shared/claudeTypes"
import { aiModeRequestSchema, type ProviderStatus, providerStatusSchema } from "../shared/ipc"
import type { WebAiService } from "./aiService"
import { claudeModelOf, codexModelOf } from "./subscriptionAi"

type AiModeServiceDependencies = {
  readonly ai: WebAiService
  readonly aiModes: AiModeStore
  readonly subscription: Pick<CodexSubscriptionAdapter, "getStatus">
  readonly claude: Pick<ClaudeSubscriptionAdapter, "getStatus">
}

export function createAiModeServices({
  ai,
  aiModes,
  subscription,
  claude,
}: AiModeServiceDependencies): {
  readonly saveAiMode: (input: z.infer<typeof aiModeRequestSchema>) => Promise<void>
  readonly providerStatus: () => Promise<ProviderStatus>
} {
  return {
    saveAiMode: async (input) => {
      const parsed = aiModeRequestSchema.parse(input)
      const current = ai.modeSettings()
      const next: AiModeSettings = {
        mode: parsed.mode,
        codexModel: parsed.codexModel ?? codexModelOf(current),
        codexReasoningEffort:
          parsed.codexReasoningEffort ?? current.codexReasoningEffort ?? "medium",
        claudeModel: parsed.claudeModel ?? claudeModelOf(current),
        claudeEffort: parsed.claudeEffort ?? current.claudeEffort ?? DEFAULT_CLAUDE_EFFORT,
      }
      await aiModes.save(next)
      ai.configureMode(next)
    },
    providerStatus: async () => {
      const settings = ai.modeSettings()
      switch (settings.mode) {
        case "api":
          return ai.status()
        case "chatgpt": {
          const account = await subscription.getStatus()
          return providerStatusSchema.parse({
            ...ai.status(),
            configured: account.authenticated,
          })
        }
        case "claude": {
          const account = await claude.getStatus()
          return providerStatusSchema.parse({
            ...ai.status(),
            configured: account.authenticated,
            claudeEffort: settings.claudeEffort ?? DEFAULT_CLAUDE_EFFORT,
          })
        }
      }
    },
  }
}
