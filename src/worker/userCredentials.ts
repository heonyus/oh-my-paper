import { z } from "zod"
import { decryptCredential, encryptCredential } from "../shared/credentialCrypto"
import {
  GEMINI_WEB_MODEL,
  GROQ_WEB_MODELS,
  type HostedCredentialProvider,
  type HostedCredentialSave,
  type HostedCredentialStatus,
  hostedCredentialStatusSchema,
} from "../shared/webCredentials"

const credentialRowSchema = z.object({
  provider: z.enum(["gemini", "groq"]),
  encrypted_key: z.string().min(1),
  model: z.string().min(1),
  selected: z.number().int().min(0).max(1),
})

export type ResolvedCredential = {
  readonly provider: HostedCredentialProvider
  readonly apiKey: string
  readonly model: string
  readonly source: "personal" | "shared"
}

function sharedCredential(env: Env, provider: HostedCredentialProvider): ResolvedCredential | null {
  if (provider === "gemini")
    return {
      provider,
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      source: "shared",
    }
  return null
}

async function personalRow(
  env: Env,
  userId: string,
  provider: HostedCredentialProvider,
): Promise<z.infer<typeof credentialRowSchema> | null> {
  const row = await env.DB.prepare(
    `SELECT provider, encrypted_key, model, selected
     FROM user_api_credentials WHERE user_id = ? AND provider = ?`,
  )
    .bind(userId, provider)
    .first()
  return row ? credentialRowSchema.parse(row) : null
}

async function resolvedPersonal(
  env: Env,
  row: z.infer<typeof credentialRowSchema>,
): Promise<ResolvedCredential> {
  return {
    provider: row.provider,
    apiKey: await decryptCredential(env.CREDENTIAL_ENCRYPTION_KEY, row.encrypted_key),
    model: row.model,
    source: "personal",
  }
}

export async function resolveUserCredential(
  env: Env,
  userId: string,
  provider: HostedCredentialProvider,
): Promise<ResolvedCredential | null> {
  const row = await personalRow(env, userId, provider)
  return row ? resolvedPersonal(env, row) : sharedCredential(env, provider)
}

export async function selectedTextCredential(
  env: Env,
  userId: string,
): Promise<ResolvedCredential | null> {
  const row = await env.DB.prepare(
    `SELECT provider, encrypted_key, model, selected FROM user_api_credentials
     WHERE user_id = ? AND provider IN ('gemini', 'groq') AND selected = 1 LIMIT 1`,
  )
    .bind(userId)
    .first()
  return row
    ? resolvedPersonal(env, credentialRowSchema.parse(row))
    : resolveUserCredential(env, userId, "gemini")
}

export async function saveUserCredential(
  env: Env,
  userId: string,
  value: HostedCredentialSave,
): Promise<void> {
  const now = new Date().toISOString()
  const selected = 1
  const upsert = env.DB.prepare(
    `INSERT INTO user_api_credentials
     (user_id, provider, encrypted_key, model, selected, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       encrypted_key = excluded.encrypted_key,
       model = excluded.model,
       selected = excluded.selected,
       updated_at = excluded.updated_at`,
  ).bind(
    userId,
    value.provider,
    await encryptCredential(env.CREDENTIAL_ENCRYPTION_KEY, value.apiKey),
    value.model,
    selected,
    now,
    now,
  )
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE user_api_credentials SET selected = 0, updated_at = ?
       WHERE user_id = ? AND provider IN ('gemini', 'groq')`,
    ).bind(now, userId),
    upsert,
  ])
}

export async function userCredentialStatus(
  env: Env,
  userId: string,
): Promise<HostedCredentialStatus> {
  const result = await env.DB.prepare(
    `SELECT provider, encrypted_key, model, selected
     FROM user_api_credentials
     WHERE user_id = ? AND provider IN ('gemini', 'groq')`,
  )
    .bind(userId)
    .all()
  const rows = z.object({ results: z.array(credentialRowSchema) }).parse(result).results
  const personal = new Map(rows.map((row) => [row.provider, row]))
  const entry = (provider: HostedCredentialProvider, fallbackModel: string) => ({
    source: personal.has(provider)
      ? ("personal" as const)
      : sharedCredential(env, provider)
        ? ("shared" as const)
        : ("missing" as const),
    model: personal.get(provider)?.model ?? fallbackModel,
  })
  const preferred = rows.find((row) => row.selected === 1)?.provider
  return hostedCredentialStatusSchema.parse({
    providers: {
      gemini: entry("gemini", GEMINI_WEB_MODEL),
      groq: entry("groq", GROQ_WEB_MODELS[0]),
    },
    preferredTextProvider: preferred === "groq" ? "groq" : "gemini",
  })
}
