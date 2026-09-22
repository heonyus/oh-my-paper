import type {
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions"
import type { z } from "zod"
import { completionLimitParameters, routedModelForRequest } from "../electron/aiCompletion"
import { systemPromptForRequest, userInputForRequest } from "../electron/aiPrompts"
import { providerClient, providerFailure } from "../electron/providerClient"
import { completeChat, streamChat } from "../electron/providerCompletion"
import {
  aiRequestSchema,
  aiResultSchema,
  type ProviderConfig,
  type ProviderStatus,
  providerStatusSchema,
} from "../shared/ipc"

type AiRequest = z.infer<typeof aiRequestSchema>
type AiResult = z.infer<typeof aiResultSchema>

function translationModel(config: ProviderConfig): string | undefined {
  return config.provider === "openrouter" ? config.pageTranslationModel : undefined
}

export class WebAiService {
  #providerConfig: ProviderConfig | null

  constructor(config: ProviderConfig | null) {
    this.#providerConfig = config
  }

  configure(config: ProviderConfig): void {
    this.#providerConfig = config
  }

  status(): ProviderStatus {
    if (this.#providerConfig) {
      return providerStatusSchema.parse({
        configured: true,
        provider: this.#providerConfig.provider,
        model: this.#providerConfig.model,
        pageTranslationModel: translationModel(this.#providerConfig),
      })
    }
    return providerStatusSchema.parse({
      configured: false,
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
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

  async run(value: AiRequest): Promise<AiResult> {
    if (!this.#providerConfig) {
      throw new Error("AI provider is not configured on server")
    }
    const request = aiRequestSchema.parse(value)
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
    if (!this.#providerConfig) {
      throw new Error("AI provider is not configured on server")
    }
    const request = aiRequestSchema.parse(value)
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
}
