import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { safeStorage } from "electron"
import { type ProviderConfig, providerConfigSchema } from "../shared/ipc"
import { DEFAULT_OPENROUTER_MODEL, isOpenRouterModel } from "../shared/providerModels"
import { DEFAULT_OPENAI_MODEL } from "./providerEnvironment"

export class ProviderConfigurationError extends Error {
  readonly name = "ProviderConfigurationError"
  constructor(
    readonly kind:
      | "missing_key"
      | "encryption_unavailable"
      | "corrupt_config"
      | "request_failed"
      | "cancelled"
      | "auth"
      | "rate_limited"
      | "timeout"
      | "privacy_denied"
      | "unsupported_capability"
      | "malformed_output",
  ) {
    super(kind)
  }
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export class ProviderConfigStore {
  readonly keyFile: string
  readonly configFile: string

  constructor(readonly root: string) {
    this.keyFile = join(root, "openai-key.bin")
    this.configFile = join(root, "provider-config.bin")
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

  async loadConfig(): Promise<ProviderConfig> {
    try {
      const encrypted = await readFile(this.configFile)
      let decryptedText: string
      try {
        decryptedText = safeStorage.decryptString(encrypted)
      } catch {
        throw new ProviderConfigurationError("corrupt_config")
      }

      let json: unknown
      try {
        json = JSON.parse(decryptedText)
      } catch {
        throw new ProviderConfigurationError("corrupt_config")
      }

      const parsed = providerConfigSchema.safeParse(json)
      if (!parsed.success) {
        throw new ProviderConfigurationError("corrupt_config")
      }

      const config = parsed.data
      return config.provider === "openrouter" && !isOpenRouterModel(config.model)
        ? { ...config, model: DEFAULT_OPENROUTER_MODEL }
        : config
    } catch (error) {
      if (error instanceof ProviderConfigurationError) {
        throw error
      }
      if (!missingFile(error)) {
        throw error
      }

      // If no saved configuration exists, check legacy keyFile
      try {
        const legacy = await readFile(this.keyFile)
        return {
          provider: "openai",
          apiKey: safeStorage.decryptString(legacy),
          model: DEFAULT_OPENAI_MODEL,
        }
      } catch (legacyError) {
        if (!missingFile(legacyError)) {
          throw legacyError
        }
      }

      throw new ProviderConfigurationError("missing_key")
    }
  }
}
