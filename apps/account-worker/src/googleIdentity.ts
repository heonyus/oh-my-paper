import { createRemoteJWKSet, type JWTVerifyGetKey, errors as joseErrors, jwtVerify } from "jose"
import { z } from "zod"

import { equalText } from "./crypto"
import { ApiError } from "./errors"

const GOOGLE_ISSUERS: readonly string[] = ["accounts.google.com", "https://accounts.google.com"]
const GoogleClaimsSchema = z
  .object({
    sub: z.string().min(1).max(255),
    nonce: z.string().min(1).max(255),
    name: z.string().min(1).max(120).optional(),
  })
  .passthrough()

export type VerifiedGoogleIdentity = {
  readonly subject: string
  readonly displayName: string | null
}

export type GoogleVerifier = (
  token: string,
  expectedNonce: string,
  nowSeconds: number,
) => Promise<VerifiedGoogleIdentity>

export const GOOGLE_KEY_SET = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
)

export function createGoogleVerifier(
  keyResolver: JWTVerifyGetKey,
  clientIds: readonly string[],
): GoogleVerifier {
  return async (token, expectedNonce, nowSeconds) => {
    try {
      const verified = await jwtVerify(token, keyResolver, {
        algorithms: ["RS256"],
        audience: [...clientIds],
        issuer: [...GOOGLE_ISSUERS],
        currentDate: new Date(nowSeconds * 1_000),
      })
      const claims = GoogleClaimsSchema.parse(verified.payload)
      if (!(await equalText(claims.nonce, expectedNonce))) {
        throw new ApiError(401, "invalid_identity", "Google identity could not be verified")
      }
      return { subject: claims.sub, displayName: claims.name ?? null }
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (error instanceof joseErrors.JOSEError || error instanceof z.ZodError) {
        throw new ApiError(401, "invalid_identity", "Google identity could not be verified")
      }
      throw error
    }
  }
}
