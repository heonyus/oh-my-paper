import type {
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions"
import type { z } from "zod"
import { completionLimitParameters, routedModelForRequest } from "../electron/aiCompletion"
import { systemPromptFor, userInputFor } from "../electron/aiPrompts"
import { providerClient, providerFailure } from "../electron/providerClient"
import { completeChat, streamChat } from "../electron/providerCompletion"
import {
  aiRequestSchema,
  aiResultSchema,
  type ProviderConfig,
  type ProviderStatus,
  providerStatusSchema,
} from "../shared/ipc"
import type { WebServerConfig } from "./config"

type AiRequest = z.infer<typeof aiRequestSchema>
type AiResult = z.infer<typeof aiResultSchema>

export class WebAiService {
  readonly #providerConfig: ProviderConfig | null

  constructor(config: WebServerConfig) {
    if (config.provider && config.model) {
      const apiKey = config.apiKeys[config.provider]
      if (apiKey) {
        this.#providerConfig = {
          provider: config.provider,
          apiKey,
          model: config.model,
        } as ProviderConfig
      } else {
        this.#providerConfig = null
      }
    } else {
      this.#providerConfig = null
    }
  }

  status(): ProviderStatus {
    if (this.#providerConfig) {
      return providerStatusSchema.parse({
        configured: true,
        provider: this.#providerConfig.provider,
        model: this.#providerConfig.model,
      })
    }
    return providerStatusSchema.parse({
      configured: false,
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
    })
  }

  #buildMessages(request: AiRequest): ChatCompletionMessageParam[] {
    const input = userInputFor(request)
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
      { role: "system", content: systemPromptFor(request.action) },
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
    const messages = this.#buildMessages(request)
    try {
      const completion = await completeChat(client, {
        model: routedModelForRequest(
          this.#providerConfig.provider,
          this.#providerConfig.model,
          request,
        ),
        messages,
        parameters: completionLimitParameters(
          this.#providerConfig.provider,
          this.#providerConfig.model,
          request,
        ),
      })
      return aiResultSchema.parse(completion)
    } catch (error) {
      console.error("[WebAiService.run] AI request failed:", error)
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
    const messages = this.#buildMessages(request)
    const model = routedModelForRequest(
      this.#providerConfig.provider,
      this.#providerConfig.model,
      request,
    )
    try {
      const completion = await streamChat(client, {
        model,
        messages,
        parameters: completionLimitParameters(
          this.#providerConfig.provider,
          this.#providerConfig.model,
          request,
        ),
        onDelta,
        ...(signal ? { signal } : {}),
      })
      return aiResultSchema.parse(completion)
    } catch (error) {
      console.error("[WebAiService.stream] AI stream failed:", error)
      throw providerFailure(error)
    }
  }
}
