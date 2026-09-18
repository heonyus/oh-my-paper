import { z } from "zod"

export const ACCESS_TTL_SECONDS = 15 * 60
export const RENEWAL_TTL_SECONDS = 30 * 24 * 60 * 60
export const OFFLINE_LEASE_TTL_SECONDS = 7 * 24 * 60 * 60
export const CHALLENGE_TTL_SECONDS = 10 * 60
export const ACCESS_AUDIENCE = "scourgify-account-api"
export const OFFLINE_AUDIENCE = "scourgify-desktop-offline"
export const OFFLINE_PURPOSE = "scourgify-local-access"

const TokenSchema = z.string().min(32).max(8_192)

export const ChallengeRequestSchema = z
  .object({
    codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()

export const ChallengeResponseSchema = z
  .object({
    challengeId: z.uuid(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    pkceMethod: z.literal("S256"),
    expiresAt: z.number().int().positive(),
  })
  .strict()
export type ChallengeResponse = z.infer<typeof ChallengeResponseSchema>

export const ExchangeRequestSchema = z
  .object({
    challengeId: z.uuid(),
    codeVerifier: z
      .string()
      .min(43)
      .max(128)
      .regex(/^[A-Za-z0-9._~-]+$/),
    idToken: TokenSchema,
  })
  .strict()

export const RenewalRequestSchema = z.object({ renewalToken: TokenSchema }).strict()
export const LogoutRequestSchema = RenewalRequestSchema

export const AccountSchema = z
  .object({
    id: z.uuid(),
    displayName: z.string().min(1).max(120).nullable(),
  })
  .strict()
export type Account = z.infer<typeof AccountSchema>

export const OfflineLeaseKeySchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string().min(1),
    y: z.string().min(1),
    alg: z.literal("ES256"),
    use: z.literal("sig"),
    kid: z.string().min(1),
  })
  .strict()

export const SessionResponseSchema = z
  .object({
    account: AccountSchema,
    accessToken: TokenSchema,
    accessExpiresAt: z.number().int().positive(),
    renewalToken: TokenSchema,
    renewalExpiresAt: z.number().int().positive(),
    offlineLease: TokenSchema,
    offlineLeaseExpiresAt: z.number().int().positive(),
    offlineLeaseKey: OfflineLeaseKeySchema,
  })
  .strict()
export type SessionResponse = z.infer<typeof SessionResponseSchema>

export const AccountResponseSchema = z.object({ account: AccountSchema }).strict()

export const ErrorResponseSchema = z
  .object({
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
  })
  .strict()

export const HealthResponseSchema = z
  .object({ ok: z.literal(true), service: z.literal("scourgify-account"), version: z.literal(1) })
  .strict()
