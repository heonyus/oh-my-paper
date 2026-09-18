import { calculateJwkThumbprint, importJWK, errors as joseErrors, jwtVerify, SignJWT } from "jose"
import { z } from "zod"

import {
  ACCESS_AUDIENCE,
  ACCESS_TTL_SECONDS,
  OFFLINE_AUDIENCE,
  OFFLINE_LEASE_TTL_SECONDS,
  OFFLINE_PURPOSE,
} from "./contracts"
import { randomOpaqueToken } from "./crypto"
import { ApiError } from "./errors"
import type { SigningJwk } from "./runtimeConfig"

const AccessClaimsSchema = z
  .object({
    sub: z.uuid(),
    sid: z.uuid(),
    purpose: z.literal("account-api"),
  })
  .passthrough()

type GrantInput = {
  readonly accountId: string
  readonly sessionId: string
  readonly renewalToken: string
  readonly nowSeconds: number
  readonly renewalExpiresAt: number
}

type CredentialGrant = {
  readonly accessToken: string
  readonly accessExpiresAt: number
  readonly renewalToken: string
  readonly renewalExpiresAt: number
  readonly offlineLease: string
  readonly offlineLeaseExpiresAt: number
  readonly offlineLeaseKey: {
    readonly kty: "EC"
    readonly crv: "P-256"
    readonly x: string
    readonly y: string
    readonly alg: "ES256"
    readonly use: "sig"
    readonly kid: string
  }
}

export type AccessIdentity = {
  readonly accountId: string
  readonly sessionId: string
}

export type TokenService = {
  readonly grant: (input: GrantInput) => Promise<CredentialGrant>
  readonly verifyAccess: (token: string, nowSeconds: number) => Promise<AccessIdentity>
}

export async function createTokenService(
  issuer: string,
  signingJwk: SigningJwk,
): Promise<TokenService> {
  const publicJwk = {
    kty: signingJwk.kty,
    crv: signingJwk.crv,
    x: signingJwk.x,
    y: signingJwk.y,
  }
  const kid = await calculateJwkThumbprint(publicJwk)
  const [privateKey, publicKey] = await Promise.all([
    importJWK(signingJwk, "ES256"),
    importJWK(publicJwk, "ES256"),
  ])
  const offlineLeaseKey: CredentialGrant["offlineLeaseKey"] = {
    ...publicJwk,
    alg: "ES256",
    use: "sig",
    kid,
  }

  return {
    grant: async (input) => {
      const accessExpiresAt = input.nowSeconds + ACCESS_TTL_SECONDS
      const offlineLeaseExpiresAt = Math.min(
        input.nowSeconds + OFFLINE_LEASE_TTL_SECONDS,
        input.renewalExpiresAt,
      )
      const accessToken = await new SignJWT({
        purpose: "account-api",
        sid: input.sessionId,
      })
        .setProtectedHeader({ alg: "ES256", typ: "JWT", kid })
        .setIssuer(issuer)
        .setAudience(ACCESS_AUDIENCE)
        .setSubject(input.accountId)
        .setJti(randomOpaqueToken())
        .setIssuedAt(input.nowSeconds)
        .setExpirationTime(accessExpiresAt)
        .sign(privateKey)
      const offlineLease = await new SignJWT({
        purpose: OFFLINE_PURPOSE,
        sid: input.sessionId,
        verified_at: input.nowSeconds,
        renewal_expires_at: input.renewalExpiresAt,
      })
        .setProtectedHeader({ alg: "ES256", typ: "JWT", kid })
        .setIssuer(issuer)
        .setAudience(OFFLINE_AUDIENCE)
        .setSubject(input.accountId)
        .setJti(randomOpaqueToken())
        .setIssuedAt(input.nowSeconds)
        .setExpirationTime(offlineLeaseExpiresAt)
        .sign(privateKey)
      return {
        accessToken,
        accessExpiresAt,
        renewalToken: input.renewalToken,
        renewalExpiresAt: input.renewalExpiresAt,
        offlineLease,
        offlineLeaseExpiresAt,
        offlineLeaseKey,
      }
    },
    verifyAccess: async (token, nowSeconds) => {
      try {
        const verified = await jwtVerify(token, publicKey, {
          algorithms: ["ES256"],
          audience: ACCESS_AUDIENCE,
          issuer,
          currentDate: new Date(nowSeconds * 1_000),
          typ: "JWT",
        })
        const claims = AccessClaimsSchema.parse(verified.payload)
        return { accountId: claims.sub, sessionId: claims.sid }
      } catch (error) {
        if (error instanceof joseErrors.JOSEError || error instanceof z.ZodError) {
          throw new ApiError(401, "invalid_access", "Access credential is missing or invalid")
        }
        throw error
      }
    },
  }
}
