import { request } from "undici"
import { z } from "zod"
import {
  type Account,
  type AccountSessionGrant,
  accountSchema,
  accountSessionGrantSchema,
} from "../shared/accountSchemas"

const challengeSchema = z
  .object({
    challengeId: z.uuid(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    pkceMethod: z.literal("S256"),
    expiresAt: z.number().int().positive(),
  })
  .strict()
const errorSchema = z
  .object({ error: z.object({ code: z.string(), message: z.string() }).strict() })
  .strict()
const configSchema = z
  .object({
    serviceOrigin: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === "https:" && new URL(value).origin === value),
    issuer: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === "https:" && new URL(value).origin === value),
    googleClientId: z.string().min(1).max(255),
  })
  .strict()

export type AccountClientConfig = z.infer<typeof configSchema>
export type AccountChallenge = z.infer<typeof challengeSchema>

export class AccountTransportError extends Error {
  readonly name = "AccountTransportError"
  constructor(
    readonly kind: "unauthorized" | "network" | "invalid_response" | "server",
    readonly status: number | null = null,
  ) {
    super(kind)
  }
}

export type AccountTransport = {
  readonly challenge: (codeChallenge: string) => Promise<AccountChallenge>
  readonly exchange: (input: {
    readonly challengeId: string
    readonly codeVerifier: string
    readonly idToken: string
  }) => Promise<AccountSessionGrant>
  readonly renew: (renewalToken: string) => Promise<AccountSessionGrant>
  readonly account: (accessToken: string) => Promise<Account>
  readonly logout: (renewalToken: string) => Promise<void>
}

export function parseAccountClientConfig(value: unknown): AccountClientConfig {
  return configSchema.parse(value)
}

export function createAccountTransport(configValue: AccountClientConfig): AccountTransport {
  const config = configSchema.parse(configValue)
  return {
    challenge: (codeChallenge) =>
      requestJson(config, "/v1/auth/challenge", "POST", challengeSchema, { codeChallenge }, 201),
    exchange: (input) =>
      requestJson(config, "/v1/auth/exchange", "POST", accountSessionGrantSchema, input, 200),
    renew: (renewalToken) =>
      requestJson(
        config,
        "/v1/auth/renew",
        "POST",
        accountSessionGrantSchema,
        { renewalToken },
        200,
      ),
    account: (accessToken) =>
      requestJson(
        config,
        "/v1/account",
        "GET",
        z
          .object({ account: accountSchema })
          .strict()
          .transform((value) => value.account),
        undefined,
        200,
        accessToken,
      ),
    logout: async (renewalToken) => {
      await requestJson(config, "/v1/logout", "POST", z.undefined(), { renewalToken }, 204)
    },
  }
}

async function requestJson<T>(
  config: AccountClientConfig,
  pathname: string,
  method: "GET" | "POST",
  schema: z.ZodType<T>,
  body: unknown,
  expectedStatus: number,
  accessToken?: string,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const requestOptions = {
      method,
      headers: {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      signal: controller.signal,
      maxRedirections: 0,
      headersTimeout: 15_000,
      bodyTimeout: 15_000,
    }
    const response = await request(
      new URL(pathname, config.serviceOrigin),
      body === undefined
        ? requestOptions
        : {
            ...requestOptions,
            body: JSON.stringify(body),
            headers: { ...requestOptions.headers, "Content-Type": "application/json" },
          },
    )
    const text = await readBoundedResponseText(response.body)
    if (response.statusCode !== expectedStatus) throw serviceError(response.statusCode, text)
    if (expectedStatus === 204) return schema.parse(undefined)
    const contentType = response.headers["content-type"]
    if (typeof contentType !== "string" || !contentType.startsWith("application/json")) {
      throw new AccountTransportError("invalid_response", response.statusCode)
    }
    return schema.parse(JSON.parse(text))
  } catch (error) {
    if (error instanceof AccountTransportError || error instanceof z.ZodError) {
      if (error instanceof z.ZodError) throw new AccountTransportError("invalid_response")
      throw error
    }
    if (error instanceof Error) throw new AccountTransportError("network")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function readBoundedResponseText(
  body: AsyncIterable<Uint8Array>,
  maximumBytes = 64 * 1_024,
): Promise<string> {
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of body) {
    length += chunk.byteLength
    if (length > maximumBytes) throw new AccountTransportError("invalid_response")
    chunks.push(chunk)
  }
  const merged = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged)
}

function serviceError(status: number, text: string): AccountTransportError {
  if (status === 401 || status === 409) return new AccountTransportError("unauthorized", status)
  const parsed = errorSchema.safeParse(parseErrorJson(text))
  return new AccountTransportError(parsed.success ? "server" : "invalid_response", status)
}

function parseErrorJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}
