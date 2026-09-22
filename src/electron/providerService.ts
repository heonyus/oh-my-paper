import type {
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions"
import { z } from "zod"
import {
  aiRequestSchema,
  aiResultSchema,
  apiKeySchema,
  type ProviderConfig,
  providerConfigSchema,
  type providerStatusSchema,
} from "../shared/ipc"
import { DEFAULT_OPENROUTER_MODEL } from "../shared/providerModels"
import { completionLimitParameters, routedModelForRequest } from "./aiCompletion"
import { systemPromptForRequest, userInputForRequest } from "./aiPrompts"
import { providerClient, providerFailure } from "./providerClient"
import { CompletionAbortedError, completeChat, streamChat } from "./providerCompletion"
import { ProviderConfigStore, ProviderConfigurationError } from "./providerConfigStore"
import { DEFAULT_OPENAI_MODEL } from "./providerEnvironment"

export { ProviderConfigurationError }

type AiRequest = z.infer<typeof aiRequestSchema>
type AiResult = z.infer<typeof aiResultSchema>

function translationModel(config: ProviderConfig): string | undefined {
  return config.provider === "openrouter" ? config.pageTranslationModel : undefined
}

export class ProviderService {
  readonly #store: ProviderConfigStore

  constructor(readonly root: string) {
    this.#store = new ProviderConfigStore(root)
  }

  get keyFile(): string {
    return this.#store.keyFile
  }

  get configFile(): string {
    return this.#store.configFile
  }

  async saveKey(value: string): Promise<void> {
    await this.#store.saveConfig({
      provider: "openai",
      apiKey: apiKeySchema.parse(value),
      model: DEFAULT_OPENAI_MODEL,
    })
  }

  async saveConfig(value: ProviderConfig): Promise<void> {
    await this.#store.saveConfig(providerConfigSchema.parse(value))
  }

  async status(): Promise<z.infer<typeof providerStatusSchema>> {
    try {
      const config = await this.#store.loadConfig()
      return {
        configured: true,
        provider: config.provider,
        model: config.model,
        pageTranslationModel: translationModel(config),
      }
    } catch (error) {
      if (error instanceof ProviderConfigurationError && error.kind === "missing_key") {
        return {
          configured: false,
          provider: "openrouter",
          model: DEFAULT_OPENROUTER_MODEL,
        }
      }
      throw error
    }
  }

  async run(value: AiRequest): Promise<AiResult> {
    const request = aiRequestSchema.parse(value)
    const config = await this.#store.loadConfig()
    const client = providerClient(config)
    const model = routedModelForRequest(
      config.provider,
      config.model,
      request,
      translationModel(config),
    )
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
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPromptForRequest(request.action, model) },
      ...(request.history ?? []),
      userMessage,
    ]
    try {
      const completion = await completeChat(client, {
        model,
        messages,
        parameters: completionLimitParameters(config.provider, model, request),
      })
      return aiResultSchema.parse(completion)
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error
      if (error instanceof CompletionAbortedError) {
        throw new ProviderConfigurationError("cancelled")
      }
      throw providerFailure(error)
    }
  }

  async runStream(
    value: AiRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<AiResult> {
    const request = aiRequestSchema.parse(value)
    const config = await this.#store.loadConfig()
    const client = providerClient(config)
    const model = routedModelForRequest(
      config.provider,
      config.model,
      request,
      translationModel(config),
    )
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
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPromptForRequest(request.action, model) },
      ...(request.history ?? []),
      userMessage,
    ]
    try {
      const completion = await streamChat(client, {
        model,
        messages,
        parameters: completionLimitParameters(config.provider, model, request),
        onDelta,
        ...(signal ? { signal } : {}),
      })
      return aiResultSchema.parse(completion)
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error
      if (error instanceof CompletionAbortedError) {
        throw new ProviderConfigurationError("cancelled")
      }
      throw providerFailure(error)
    }
  }

  async completePrompt(value: string, signal: AbortSignal): Promise<AiResult> {
    const prompt = z.string().min(1).max(60_000).parse(value)
    const config = await this.#store.loadConfig()
    try {
      return aiResultSchema.parse(
        await completeChat(providerClient(config), {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          parameters: {},
          signal,
        }),
      )
    } catch (error) {
      throw providerFailure(error)
    }
  }
}
