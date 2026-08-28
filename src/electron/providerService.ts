import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { safeStorage } from "electron"
import OpenAI from "openai"
import type {
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions"
import type { z } from "zod"
import {
  aiRequestSchema,
  aiResultSchema,
  apiKeySchema,
  type ProviderConfig,
  providerConfigSchema,
  type providerStatusSchema,
} from "../shared/ipc"
import { DEFAULT_OPENROUTER_MODEL, isOpenRouterModel } from "../shared/providerModels"
import { systemPromptFor, userInputFor } from "./aiPrompts"
import { DEFAULT_OPENAI_MODEL, providerConfigFromEnvironment } from "./providerEnvironment"

type AiRequest = z.infer<typeof aiRequestSchema>
type AiResult = z.infer<typeof aiResultSchema>

export class ProviderConfigurationError extends Error {
  readonly name = "ProviderConfigurationError"

  constructor(readonly kind: "missing_key" | "encryption_unavailable" | "request_failed") {
    super(kind)
  }
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export class ProviderService {
  readonly keyFile: string
  readonly configFile: string

  constructor(readonly root: string) {
    this.keyFile = join(root, "openai-key.bin")
    this.configFile = join(root, "provider-config.bin")
  }

  async saveKey(value: string): Promise<void> {
    await this.saveConfig({
      provider: "openai",
      apiKey: apiKeySchema.parse(value),
      model: DEFAULT_OPENAI_MODEL,
    })
  }

  async saveConfig(value: ProviderConfig): Promise<void> {
    const config = providerConfigSchema.parse(value)
    if (!safeStorage.isEncryptionAvailable()) {
      throw new ProviderConfigurationError("encryption_unavailable")
    }
    await mkdir(this.root, { recursive: true })
    await writeFile(this.configFile, safeStorage.encryptString(JSON.stringify(config)), {
      mode: 0o600,
    })
  }

  async #loadConfig(): Promise<ProviderConfig> {
    try {
      const encrypted = await readFile(this.configFile)
      const config = providerConfigSchema.parse(JSON.parse(safeStorage.decryptString(encrypted)))
      return config.provider === "openrouter" && !isOpenRouterModel(config.model)
        ? { ...config, model: DEFAULT_OPENROUTER_MODEL }
        : config
    } catch (error) {
      if (!missingFile(error)) throw error
      try {
        const legacy = await readFile(this.keyFile)
        return {
          provider: "openai",
          apiKey: safeStorage.decryptString(legacy),
          model: DEFAULT_OPENAI_MODEL,
        }
      } catch (legacyError) {
        if (missingFile(legacyError)) {
          const environment = providerConfigFromEnvironment(process.env)
          if (environment) return environment
          throw new ProviderConfigurationError("missing_key")
        }
        throw legacyError
      }
    }
  }

  async status(): Promise<z.infer<typeof providerStatusSchema>> {
    try {
      const config = await this.#loadConfig()
      return { configured: true, provider: config.provider, model: config.model }
    } catch (error) {
      if (error instanceof ProviderConfigurationError && error.kind === "missing_key") {
        return { configured: false, provider: "openai", model: DEFAULT_OPENAI_MODEL }
      }
      throw error
    }
  }

  async run(value: AiRequest): Promise<AiResult> {
    const request = aiRequestSchema.parse(value)
    const config = await this.#loadConfig()
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.provider === "openrouter" ? { baseURL: "https://openrouter.ai/api/v1" } : {}),
    })
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
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPromptFor(request.action) },
      ...(request.history ?? []),
      userMessage,
    ]
    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages,
      })
      const text = response.choices[0]?.message.content
      if (!text) throw new ProviderConfigurationError("request_failed")
      return aiResultSchema.parse({ text, model: response.model })
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error
      throw new ProviderConfigurationError("request_failed")
    }
  }
}
