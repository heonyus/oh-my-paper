import { z } from "zod"
import {
  type AccountSessionGrant,
  accountIdSchema,
  accountSessionGrantSchema,
  accountSessionIdSchema,
} from "../shared/accountSchemas"

const ACCESS_AUDIENCE = "scourgify-account-api"
const OFFLINE_AUDIENCE = "scourgify-desktop-offline"
const ACCESS_SECONDS = 15 * 60
const OFFLINE_SECONDS = 7 * 24 * 60 * 60
const RENEWAL_SECONDS = 30 * 24 * 60 * 60

const headerSchema = z
  .object({ alg: z.literal("ES256"), typ: z.literal("JWT"), kid: z.string().min(1) })
  .passthrough()
const commonClaimsSchema = z
  .object({
    iss: z.string().url(),
    aud: z.string(),
    sub: accountIdSchema,
    sid: accountSessionIdSchema,
    jti: z.string().min(16).max(200),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
    purpose: z.string(),
  })
  .passthrough()
const offlineClaimsSchema = commonClaimsSchema.extend({
  verified_at: z.number().int().positive(),
  renewal_expires_at: z.number().int().positive(),
})

export class AccountJwtError extends Error {
  readonly name = "AccountJwtError"
  constructor(readonly kind: "invalid" | "expired") {
    super(kind)
  }
}

export type VerifiedAccountGrant = {
  readonly accountId: z.infer<typeof accountIdSchema>
  readonly sessionId: z.infer<typeof accountSessionIdSchema>
  readonly verifiedAt: number
}

type ParsedJwt = {
  readonly header: z.infer<typeof headerSchema>
  readonly payload: unknown
  readonly signingInput: Uint8Array<ArrayBuffer>
  readonly signature: Uint8Array<ArrayBuffer>
}

export async function verifyAccountSessionGrant(
  value: AccountSessionGrant,
  issuer: string,
  nowSeconds: number,
): Promise<VerifiedAccountGrant> {
  const grant = accountSessionGrantSchema.parse(value)
  const expectedKid = await keyThumbprint(grant.offlineLeaseKey)
  if (expectedKid !== grant.offlineLeaseKey.kid) throw new AccountJwtError("invalid")
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: grant.offlineLeaseKey.x,
      y: grant.offlineLeaseKey.y,
      ext: true,
      key_ops: ["verify"],
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  )
  const access = await verifiedClaims(grant.accessToken, key, expectedKid)
  const offline = offlineClaimsSchema.parse(
    await verifiedPayload(grant.offlineLease, key, expectedKid),
  )
  if (
    access.iss !== issuer ||
    offline.iss !== issuer ||
    access.aud !== ACCESS_AUDIENCE ||
    access.purpose !== "account-api" ||
    offline.aud !== OFFLINE_AUDIENCE ||
    offline.purpose !== "scourgify-local-access" ||
    access.sub !== grant.account.id ||
    offline.sub !== grant.account.id ||
    access.sid !== offline.sid ||
    access.exp !== grant.accessExpiresAt ||
    offline.exp !== grant.offlineLeaseExpiresAt ||
    access.exp - access.iat !== ACCESS_SECONDS ||
    offline.verified_at !== offline.iat ||
    offline.renewal_expires_at !== grant.renewalExpiresAt ||
    offline.exp !== Math.min(offline.iat + OFFLINE_SECONDS, grant.renewalExpiresAt) ||
    grant.renewalExpiresAt <= offline.iat ||
    grant.renewalExpiresAt > offline.iat + RENEWAL_SECONDS ||
    access.iat > nowSeconds + 60 ||
    offline.iat > nowSeconds + 60
  ) {
    throw new AccountJwtError("invalid")
  }
  return { accountId: access.sub, sessionId: access.sid, verifiedAt: offline.verified_at }
}

async function verifiedClaims(token: string, key: CryptoKey, kid: string) {
  return commonClaimsSchema.parse(await verifiedPayload(token, key, kid))
}

async function verifiedPayload(token: string, key: CryptoKey, kid: string): Promise<unknown> {
  try {
    const parsed = parseJwt(token)
    if (parsed.header.kid !== kid || parsed.signature.byteLength !== 64) {
      throw new AccountJwtError("invalid")
    }
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      parsed.signature,
      parsed.signingInput,
    )
    if (!valid) throw new AccountJwtError("invalid")
    return parsed.payload
  } catch (error) {
    if (error instanceof AccountJwtError) throw error
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof DOMException
    ) {
      throw new AccountJwtError("invalid")
    }
    throw error
  }
}

function parseJwt(token: string): ParsedJwt {
  const segments = token.split(".")
  const encodedHeader = segments[0]
  const encodedPayload = segments[1]
  const encodedSignature = segments[2]
  if (segments.length !== 3 || !encodedHeader || !encodedPayload || !encodedSignature) {
    throw new AccountJwtError("invalid")
  }
  return {
    header: headerSchema.parse(parseJson(encodedHeader)),
    payload: parseJson(encodedPayload),
    signingInput: new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    signature: decodeBase64Url(encodedSignature),
  }
}

function parseJson(value: string): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(value)))
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new AccountJwtError("invalid")
  }
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  const decoded = atob(padded)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  return bytes
}

async function keyThumbprint(key: AccountSessionGrant["offlineLeaseKey"]): Promise<string> {
  const canonical = JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y })
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)),
  )
  return base64Url(digest)
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=/gu, "")
}
