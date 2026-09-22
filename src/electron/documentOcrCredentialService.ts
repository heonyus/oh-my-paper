import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { safeStorage } from "electron"
import { documentOcrKeySchema } from "../shared/documentOcr"

type OcrEnvironment = {
  readonly MISTRAL_API_KEY?: string
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export class DocumentOcrConfigurationError extends Error {
  readonly name = "DocumentOcrConfigurationError"

  constructor(readonly kind: "missing_key" | "encryption_unavailable") {
    super(kind)
  }
}

export class DocumentOcrCredentialService {
  readonly #keyFile: string

  constructor(
    readonly root: string,
    readonly environment: OcrEnvironment = {},
  ) {
    this.#keyFile = join(root, "mistral-ocr-key.bin")
  }

  async saveKey(value: string): Promise<void> {
    const key = documentOcrKeySchema.parse(value)
    if (!safeStorage.isEncryptionAvailable())
      throw new DocumentOcrConfigurationError("encryption_unavailable")
    await mkdir(this.root, { recursive: true })
    await writeFile(this.#keyFile, safeStorage.encryptString(key), { mode: 0o600 })
  }

  async apiKey(): Promise<string | null> {
    const environmentKey = documentOcrKeySchema.safeParse(this.environment.MISTRAL_API_KEY)
    if (environmentKey.success) return environmentKey.data
    try {
      return documentOcrKeySchema.parse(safeStorage.decryptString(await readFile(this.#keyFile)))
    } catch (error) {
      if (missingFile(error)) return null
      throw error
    }
  }
}
