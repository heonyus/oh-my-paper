import type {
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions"
import type { z } from "zod"
import { completionLimitParameters, routedModelForRequest } from "../electron/aiCompletion"
import type { AiModeSettings } from "../electron/aiModeStore"
import {
  systemPromptFor,
  systemPromptForRequest,
  userInputFor,
  userInputForRequest,
} from "../electron/aiPrompts"
import type { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import { providerClient, providerFailure } from "../electron/providerClient"
import { completeChat, streamChat } from "../electron/providerCompletion"
import { ProviderConfigurationError } from "../electron/providerConfigStore"
import {
  aiRequestSchema,
  aiResultSchema,
  type ProviderConfig,
  type ProviderStatus,
  providerStatusSchema,
} from "../shared/ipc"
import { DEFAULT_OPENROUTER_MODEL } from "../shared/providerModels"

type AiRequest = z.infer<typeof aiRequestSchema>
type AiResult = z.infer<typeof aiResultSchema>

function translationModel(config: ProviderConfig): string | undefined {
  return config.provider === "openrouter" ? config.pageTranslationModel : undefined
}

export class WebAiService {
  #providerConfig: ProviderConfig | null
  readonly #subscription: CodexSubscriptionAdapter | null
  #modeSettings: AiModeSettings

  constructor(
    config: ProviderConfig | null,
    subscription: CodexSubscriptionAdapter | null = null,
    modeSettings: AiModeSettings = {
      mode: "chatgpt",
      codexModel: "gpt-5.6-sol",
      codexReasoningEffort: "medium",
    },
  ) {
    this.#providerConfig = config
    this.#subscription = subscription
    this.#modeSettings = modeSettings
  }

  configure(config: ProviderConfig): void {
    this.#providerConfig = config
  }

  configureMode(settings: AiModeSettings): void {
    this.#modeSettings = settings
  }

  modeSettings(): AiModeSettings {
    return this.#modeSettings
  }

  status(): ProviderStatus {
    if (this.#modeSettings.mode === "chatgpt") {
      return providerStatusSchema.parse({
        configured: false,
        provider: "openai",
        model: this.#modeSettings.codexModel ?? "gpt-5.6-sol",
        mode: "chatgpt",
        codexModel: this.#modeSettings.codexModel ?? "gpt-5.6-sol",
        codexReasoningEffort: this.#modeSettings.codexReasoningEffort ?? "medium",
      })
    }
    if (this.#providerConfig) {
      return providerStatusSchema.parse({
        configured: true,
        provider: this.#providerConfig.provider,
        model: this.#providerConfig.model,
        pageTranslationModel: translationModel(this.#providerConfig),
        mode: "api",
      })
    }
    return providerStatusSchema.parse({
      configured: false,
      provider: "openrouter",
      model: DEFAULT_OPENROUTER_MODEL,
      mode: "api",
    })
  }

  #buildMessages(request: AiRequest, model: string): ChatCompletionMessageParam[] {
    const input = userInputForRequest(request, model)
    const userMessage: ChatCompletionUserMessageParam = request.imageDataUrl
      ? {
          role: "user",
          content: [
            { type: "text", text: input },
            { type: "image_url", image_url: { url: request.imageDataUrl, detail: "high" } },
          ],
        }
      : { role: "user", content: input }

    return [
      { role: "system", content: systemPromptForRequest(request.action, model) },
      ...(request.history ?? []),
      userMessage,
    ]
  }

  async chat(
    messages: readonly { role: "system" | "user" | "assistant"; content: string }[],
  ): Promise<{ readonly text: string; readonly model: string }> {
    if (this.#modeSettings.mode === "chatgpt") {
      return this.#chatWithSubscription(messages)
    }
    if (!this.#providerConfig) {
      throw new ProviderConfigurationError("missing_key")
    }
    const client = providerClient(this.#providerConfig)
    const openAiMessages: ChatCompletionMessageParam[] = []
    for (const message of messages) {
      if (message.role === "system") {
        openAiMessages.push({ role: "system", content: message.content })
      } else if (message.role === "assistant") {
        openAiMessages.push({ role: "assistant", content: message.content })
      } else {
        openAiMessages.push({ role: "user", content: message.content })
      }
    }
    try {
      return await completeChat(client, {
        model: this.#providerConfig.model,
        messages: openAiMessages,
        parameters: { max_completion_tokens: 4_096 },
      })
    } catch (error) {
      throw providerFailure(error)
    }
  }

  async run(value: AiRequest): Promise<AiResult> {
    const request = aiRequestSchema.parse(value)
    if (this.#modeSettings.mode === "chatgpt") {
      return this.#runWithSubscription(request)
    }
    if (!this.#providerConfig) {
      throw new ProviderConfigurationError("missing_key")
    }
    const client = providerClient(this.#providerConfig)
    const model = routedModelForRequest(
      this.#providerConfig.provider,
      this.#providerConfig.model,
      request,
      translationModel(this.#providerConfig),
    )
    const messages = this.#buildMessages(request, model)
    try {
      const completion = await completeChat(client, {
        model,
        messages,
        parameters: completionLimitParameters(this.#providerConfig.provider, model, request),
      })
      return aiResultSchema.parse(completion)
    } catch (error) {
      throw providerFailure(error)
    }
  }

  async stream(
    value: AiRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<AiResult> {
    const request = aiRequestSchema.parse(value)
    if (this.#modeSettings.mode === "chatgpt") {
      return this.#runWithSubscription(request, onDelta, signal)
    }
    if (!this.#providerConfig) {
      throw new ProviderConfigurationError("missing_key")
    }
    const client = providerClient(this.#providerConfig)
    const model = routedModelForRequest(
      this.#providerConfig.provider,
      this.#providerConfig.model,
      request,
      translationModel(this.#providerConfig),
    )
    const messages = this.#buildMessages(request, model)
    try {
      const completion = await streamChat(client, {
        model,
        messages,
        parameters: completionLimitParameters(this.#providerConfig.provider, model, request),
        onDelta,
        ...(signal ? { signal } : {}),
      })
      return aiResultSchema.parse(completion)
    } catch (error) {
      throw providerFailure(error)
    }
  }

  #subscriptionModel(): string {
    return this.#modeSettings.codexModel ?? "gpt-5.6-sol"
  }

  #subscriptionPrompt(messages: readonly { role: string; content: string }[]): string {
    return messages
      .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
      .join("\n\n")
  }

  async #chatWithSubscription(
    messages: readonly { role: "system" | "user" | "assistant"; content: string }[],
  ): Promise<{ readonly text: string; readonly model: string }> {
    if (!this.#subscription) throw new ProviderConfigurationError("auth")
    const model = this.#subscriptionModel()
    const text = await this.#subscription.runCompletion({
      prompt: this.#subscriptionPrompt(messages),
      model,
      reasoningEffort: this.#modeSettings.codexReasoningEffort,
    })
    return { text, model }
  }

  async #runWithSubscription(
    request: AiRequest,
    onDelta?: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<AiResult> {
    if (!this.#subscription) throw new ProviderConfigurationError("auth")
    const model = this.#subscriptionModel()
    const messages = [
      { role: "system", content: systemPromptFor(request.action) },
      ...(request.history ?? []),
      { role: "user", content: userInputFor(request) },
    ]
    const text = await this.#subscription.runCompletion({
      prompt: this.#subscriptionPrompt(messages),
      imageDataUrl: request.imageDataUrl,
      model,
      reasoningEffort: this.#modeSettings.codexReasoningEffort,
      ...(onDelta ? { onDelta } : {}),
      ...(signal ? { signal } : {}),
    })
    return aiResultSchema.parse({ text, model })
  }
}
