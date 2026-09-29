import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { replaceFile } from "../electron/fileReplace"
import { documentOcrKeySchema } from "../shared/documentOcr"
import { apiKeySchema, type ProviderConfig } from "../shared/ipc"
import { OPENROUTER_MODEL_OPTIONS } from "../shared/providerModels"

const openRouterConfigSchema = z.object({
  provider: z.literal("openrouter"),
  apiKey: apiKeySchema,
  model: z.enum(OPENROUTER_MODEL_OPTIONS),
  pageTranslationModel: z.string().trim().min(1).max(160).optional(),
})

const legacyOpenCodexConfigSchema = z.object({
  provider: z.literal("opencodex"),
  model: z.string().trim().min(1).max(160),
})

const apiProviderConfigSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("openai"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
  openRouterConfigSchema,
  z.object({
    provider: z.literal("gemini"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
  z.object({
    provider: z.literal("groq"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
])

const storedCredentialSchema = z.object({
  openai: z
    .object({
      provider: z.literal("openai"),
      apiKey: apiKeySchema,
      model: z.string().trim().min(1).max(160),
    })
    .nullable()
    .default(null),
  openrouter: openRouterConfigSchema.nullable(),
  gemini: z
    .object({
      provider: z.literal("gemini"),
      apiKey: apiKeySchema,
      model: z.string().trim().min(1).max(160),
    })
    .nullable()
    .default(null),
  groq: z
    .object({
      provider: z.literal("groq"),
      apiKey: apiKeySchema,
      model: z.string().trim().min(1).max(160),
    })
    .nullable()
    .default(null),
  opencodex: legacyOpenCodexConfigSchema.nullable().default(null),
  selected: z
    .enum(["openai", "openrouter", "gemini", "groq", "opencodex"])
    .nullable()
    .default(null),
  mistral: documentOcrKeySchema.nullable().default(null),
})

type StoredCredentials = z.infer<typeof storedCredentialSchema>

export type LocalCredentialFallback = {
  readonly openai?: z.infer<typeof apiProviderConfigSchema> | null
  readonly openrouter: z.infer<typeof openRouterConfigSchema> | null
  readonly gemini?: z.infer<typeof apiProviderConfigSchema> | null
  readonly groq?: z.infer<typeof apiProviderConfigSchema> | null
  readonly mistral?: string | null
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export class LocalCredentialStore {
  readonly #file: string
  readonly #fallback: LocalCredentialFallback
  #saved: StoredCredentials
  #writeQueue: Promise<void> = Promise.resolve()

  private constructor(
    readonly root: string,
    fallback: LocalCredentialFallback,
    saved: StoredCredentials,
  ) {
    this.#file = join(root, "provider-credentials.json")
    this.#fallback = fallback
    this.#saved = saved
  }

  static async open(
    root: string,
    fallback: LocalCredentialFallback,
  ): Promise<LocalCredentialStore> {
    const file = join(root, "provider-credentials.json")
    try {
      const saved = storedCredentialSchema.parse(JSON.parse(await readFile(file, "utf8")))
      return new LocalCredentialStore(root, fallback, saved)
    } catch (error) {
      if (!missingFile(error)) throw error
      return new LocalCredentialStore(root, fallback, {
        openai: null,
        openrouter: null,
        gemini: null,
        groq: null,
        opencodex: null,
        selected: null,
        mistral: null,
      })
    }
  }

  openRouterConfig(): z.infer<typeof openRouterConfigSchema> | null {
    return this.#saved.openrouter ?? this.#fallback.openrouter
  }

  providerConfig(): ProviderConfig | null {
    const selected = this.#saved.selected
    if (selected === "opencodex") return null
    if (selected === "openai" && this.openAiConfig()) return this.openAiConfig()
    if (selected === "openrouter" && this.openRouterConfig()) return this.openRouterConfig()
    if (selected === "gemini" && this.geminiConfig()) return this.geminiConfig()
    if (selected === "groq" && this.groqConfig()) return this.groqConfig()
    return (
      this.openRouterConfig() ?? this.openAiConfig() ?? this.geminiConfig() ?? this.groqConfig()
    )
  }

  mistralApiKey(): string | null {
    return this.#saved.mistral ?? this.#fallback.mistral ?? null
  }

  async saveOpenRouter(value: ProviderConfig): Promise<void> {
    await this.saveApiConfig(value)
  }

  async saveApiConfig(value: ProviderConfig): Promise<void> {
    const config = apiProviderConfigSchema.parse(value)
    switch (config.provider) {
      case "openai":
        await this.#save({ ...this.#saved, openai: config, selected: "openai" })
        return
      case "openrouter":
        await this.#save({ ...this.#saved, openrouter: config, selected: "openrouter" })
        return
      case "gemini":
        await this.#save({ ...this.#saved, gemini: config, selected: "gemini" })
        return
      case "groq":
        await this.#save({ ...this.#saved, groq: config, selected: "groq" })
        return
    }
  }

  openAiConfig(): Extract<ProviderConfig, { provider: "openai" }> | null {
    const config = this.#saved.openai ?? this.#fallback.openai
    return config?.provider === "openai" ? config : null
  }

  geminiConfig(): Extract<ProviderConfig, { provider: "gemini" }> | null {
    const config = this.#saved.gemini ?? this.#fallback.gemini
    return config?.provider === "gemini" ? config : null
  }

  groqConfig(): Extract<ProviderConfig, { provider: "groq" }> | null {
    const config = this.#saved.groq ?? this.#fallback.groq
    return config?.provider === "groq" ? config : null
  }

  async saveMistralApiKey(value: string): Promise<void> {
    const mistral = documentOcrKeySchema.parse(value)
    await this.#save({ ...this.#saved, mistral })
  }

  async #save(next: StoredCredentials): Promise<void> {
    const parsed = storedCredentialSchema.parse(next)
    const operation = this.#writeQueue.then(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      const temporary = `${this.#file}.next`
      await writeFile(temporary, `${JSON.stringify(parsed)}\n`, { mode: 0o600 })
      await replaceFile(temporary, this.#file)
      this.#saved = parsed
    })
    this.#writeQueue = operation.catch(() => undefined)
    await operation
  }
}
