import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { ZodError } from "zod"
import { type CodexReasoningEffort, codexReasoningEffortSchema } from "../shared/ipc"
import { type AiMode, aiModeSchema } from "../shared/providerModels"

export class AiModeConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiModeConfigurationError"
  }
}

export class AiModeStore {
  private readonly filePath: string

  constructor(root: string) {
    this.filePath = join(root, "ai-mode.json")
  }

  async loadSettings(): Promise<AiModeSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"))
      if (typeof parsed === "string") {
        return {
          mode: aiModeSchema.parse(parsed),
          codexModel: "gpt-5.6-sol",
          codexReasoningEffort: "medium",
        }
      }
      return {
        mode: aiModeSchema.parse(parsed.mode),
        codexModel: typeof parsed.codexModel === "string" ? parsed.codexModel : "gpt-5.6-sol",
        codexReasoningEffort:
          typeof parsed.codexReasoningEffort === "string"
            ? codexReasoningEffortSchema.parse(parsed.codexReasoningEffort)
            : "medium",
      }
    } catch (error) {
      if (isMissingFile(error)) {
        return { mode: "chatgpt", codexModel: "gpt-5.6-sol", codexReasoningEffort: "medium" }
      }
      if (error instanceof ZodError || error instanceof SyntaxError) {
        throw new AiModeConfigurationError("Saved AI access mode is invalid")
      }
      throw error
    }
  }

  async load(): Promise<AiMode> {
    return (await this.loadSettings()).mode
  }

  async save(settings: AiMode | AiModeSettings): Promise<void> {
    const value: AiModeSettings =
      typeof settings === "string"
        ? {
            mode: aiModeSchema.parse(settings),
            codexModel: "gpt-5.6-sol",
            codexReasoningEffort: "medium",
          }
        : {
            mode: aiModeSchema.parse(settings.mode),
            codexModel: typeof settings.codexModel === "string" ? settings.codexModel : undefined,
            codexReasoningEffort: settings.codexReasoningEffort
              ? codexReasoningEffortSchema.parse(settings.codexReasoningEffort)
              : undefined,
          }
    const root = join(this.filePath, "..")
    await mkdir(root, { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(temporaryPath, this.filePath)
  }
}

export type AiModeSettings = {
  readonly mode: AiMode
  readonly codexModel?: string | undefined
  readonly codexReasoningEffort?: CodexReasoningEffort | undefined
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
