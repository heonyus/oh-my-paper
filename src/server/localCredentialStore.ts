import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { documentOcrKeySchema } from "../shared/documentOcr"
import { apiKeySchema, type ProviderConfig } from "../shared/ipc"
import { OPENROUTER_MODEL_OPTIONS } from "../shared/providerModels"

const openRouterConfigSchema = z.object({
  provider: z.literal("openrouter"),
  apiKey: apiKeySchema,
  model: z.enum(OPENROUTER_MODEL_OPTIONS),
})

const storedCredentialSchema = z.object({
  openrouter: openRouterConfigSchema.nullable(),
  mistralApiKey: documentOcrKeySchema.nullable(),
})

type StoredCredentials = z.infer<typeof storedCredentialSchema>

export type LocalCredentialFallback = {
  readonly openrouter: z.infer<typeof openRouterConfigSchema> | null
  readonly mistralApiKey: string | null
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
        openrouter: null,
        mistralApiKey: null,
      })
    }
  }

  openRouterConfig(): z.infer<typeof openRouterConfigSchema> | null {
    return this.#saved.openrouter ?? this.#fallback.openrouter
  }

  mistralKey(): string | null {
    return this.#saved.mistralApiKey ?? this.#fallback.mistralApiKey
  }

  async saveOpenRouter(value: ProviderConfig): Promise<void> {
    const openrouter = openRouterConfigSchema.parse(value)
    await this.#save({ ...this.#saved, openrouter })
  }

  async saveMistral(value: string): Promise<void> {
    const mistralApiKey = documentOcrKeySchema.parse(value)
    await this.#save({ ...this.#saved, mistralApiKey })
  }

  async #save(next: StoredCredentials): Promise<void> {
    const parsed = storedCredentialSchema.parse(next)
    const operation = this.#writeQueue.then(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      const temporary = `${this.#file}.next`
      await writeFile(temporary, `${JSON.stringify(parsed)}\n`, { mode: 0o600 })
      await rename(temporary, this.#file)
      this.#saved = parsed
    })
    this.#writeQueue = operation.catch(() => undefined)
    await operation
  }
}
