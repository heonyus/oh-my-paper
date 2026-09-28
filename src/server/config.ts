import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { config as loadDotenv } from "dotenv"
import { z } from "zod"
import { DEFAULT_OPENROUTER_MODEL } from "../shared/providerModels"

const providerSchema = z.enum(["openai", "openrouter", "gemini", "groq"])

const environmentSchema = z.object({
  OH_MY_PAPER_WEB_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  OH_MY_PAPER_WEB_PORT: z.coerce.number().int().min(1024).max(65_535).default(8788),
  OH_MY_PAPER_WEB_DATA_DIR: z.string().trim().min(1).optional(),
  OH_MY_PAPER_WEB_STATIC_DIR: z.string().trim().min(1).optional(),
  OH_MY_PAPER_WEB_PROVIDER: providerSchema.optional(),
  OH_MY_PAPER_WEB_MODEL: z.string().trim().min(1).max(160).optional(),
  OPENAI_API_KEY: z.string().trim().min(20).optional(),
  OPENROUTER_API_KEY: z.string().trim().min(20).optional(),
  GEMINI_API_KEY: z.string().trim().min(20).optional(),
  GROQ_API_KEY: z.string().trim().min(20).optional(),
})

export type WebServerConfig = {
  readonly host: "127.0.0.1"
  readonly port: number
  readonly dataDir: string
  readonly staticDir: string
  readonly provider: z.infer<typeof providerSchema> | null
  readonly model: string | null
  readonly apiKeys: Readonly<Record<z.infer<typeof providerSchema>, string | null>>
}

function configuredProvider(
  value: z.infer<typeof environmentSchema>,
): z.infer<typeof providerSchema> | null {
  if (value.OH_MY_PAPER_WEB_PROVIDER) return value.OH_MY_PAPER_WEB_PROVIDER
  if (value.GEMINI_API_KEY) return "gemini"
  if (value.GROQ_API_KEY) return "groq"
  if (value.OPENROUTER_API_KEY) return "openrouter"
  if (value.OPENAI_API_KEY) return "openai"
  return null
}

function defaultModel(provider: z.infer<typeof providerSchema> | null): string | null {
  if (provider === "gemini") return "gemini-3.5-flash-lite"
  if (provider === "groq") return "openai/gpt-oss-20b"
  if (provider === "openrouter") return DEFAULT_OPENROUTER_MODEL
  if (provider === "openai") return "gpt-4.1-mini"
  return null
}

export function readWebServerConfig(environment: NodeJS.ProcessEnv = process.env): WebServerConfig {
  loadDotenv()
  const parsed = environmentSchema.parse(environment)
  const provider = configuredProvider(parsed)
  return {
    host: parsed.OH_MY_PAPER_WEB_HOST,
    port: parsed.OH_MY_PAPER_WEB_PORT,
    dataDir: resolve(parsed.OH_MY_PAPER_WEB_DATA_DIR ?? join(homedir(), ".ohmypaper", "web")),
    staticDir: resolve(parsed.OH_MY_PAPER_WEB_STATIC_DIR ?? join(process.cwd(), "dist-web")),
    provider,
    model: parsed.OH_MY_PAPER_WEB_MODEL ?? defaultModel(provider),
    apiKeys: {
      openai: parsed.OPENAI_API_KEY ?? null,
      openrouter: parsed.OPENROUTER_API_KEY ?? null,
      gemini: parsed.GEMINI_API_KEY ?? null,
      groq: parsed.GROQ_API_KEY ?? null,
    },
  }
}
