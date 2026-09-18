import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { config as loadDotenv } from "dotenv"
import { z } from "zod"

const providerSchema = z.enum(["openai", "openrouter", "gemini", "groq"])

const environmentSchema = z.object({
  SCOURGIFY_WEB_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  SCOURGIFY_WEB_PORT: z.coerce.number().int().min(1024).max(65_535).default(8788),
  SCOURGIFY_WEB_DATA_DIR: z.string().trim().min(1).optional(),
  SCOURGIFY_WEB_STATIC_DIR: z.string().trim().min(1).optional(),
  SCOURGIFY_WEB_PROVIDER: providerSchema.optional(),
  SCOURGIFY_WEB_MODEL: z.string().trim().min(1).max(160).optional(),
  OPENAI_API_KEY: z.string().trim().min(20).optional(),
  OPENROUTER_API_KEY: z.string().trim().min(20).optional(),
  GEMINI_API_KEY: z.string().trim().min(20).optional(),
  GROQ_API_KEY: z.string().trim().min(20).optional(),
  MISTRAL_API_KEY: z.string().trim().min(20).optional(),
})

export type WebServerConfig = {
  readonly host: "127.0.0.1"
  readonly port: number
  readonly dataDir: string
  readonly staticDir: string
  readonly provider: z.infer<typeof providerSchema> | null
  readonly model: string | null
  readonly apiKeys: Readonly<Record<z.infer<typeof providerSchema>, string | null>>
  readonly mistralApiKey: string | null
}

function configuredProvider(
  value: z.infer<typeof environmentSchema>,
): z.infer<typeof providerSchema> | null {
  if (value.SCOURGIFY_WEB_PROVIDER) return value.SCOURGIFY_WEB_PROVIDER
  if (value.GEMINI_API_KEY) return "gemini"
  if (value.GROQ_API_KEY) return "groq"
  if (value.OPENROUTER_API_KEY) return "openrouter"
  if (value.OPENAI_API_KEY) return "openai"
  return null
}

function defaultModel(provider: z.infer<typeof providerSchema> | null): string | null {
  if (provider === "gemini") return "gemini-3.5-flash-lite"
  if (provider === "groq") return "openai/gpt-oss-20b"
  if (provider === "openrouter") return "google/gemini-2.5-flash-lite"
  if (provider === "openai") return "gpt-4.1-mini"
  return null
}

export function readWebServerConfig(environment: NodeJS.ProcessEnv = process.env): WebServerConfig {
  loadDotenv()
  const parsed = environmentSchema.parse(environment)
  const provider = configuredProvider(parsed)
  return {
    host: parsed.SCOURGIFY_WEB_HOST,
    port: parsed.SCOURGIFY_WEB_PORT,
    dataDir: resolve(parsed.SCOURGIFY_WEB_DATA_DIR ?? join(homedir(), ".scourgify", "web")),
    staticDir: resolve(parsed.SCOURGIFY_WEB_STATIC_DIR ?? join(process.cwd(), "dist-web")),
    provider,
    model: parsed.SCOURGIFY_WEB_MODEL ?? defaultModel(provider),
    apiKeys: {
      openai: parsed.OPENAI_API_KEY ?? null,
      openrouter: parsed.OPENROUTER_API_KEY ?? null,
      gemini: parsed.GEMINI_API_KEY ?? null,
      groq: parsed.GROQ_API_KEY ?? null,
    },
    mistralApiKey: parsed.MISTRAL_API_KEY ?? null,
  }
}
