import { env } from "cloudflare:workers"
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose"

import {
  type ChallengeResponse,
  ChallengeResponseSchema,
  type SessionResponse,
  SessionResponseSchema,
} from "../src/contracts"
import { pkceChallenge } from "../src/crypto"
import { createGoogleVerifier } from "../src/googleIdentity"
import { createHandler } from "../src/index"

const GOOGLE_CLIENT_ID = "UNCONFIGURED_GOOGLE_DESKTOP_CLIENT_ID"
const GOOGLE_ISSUER = "https://accounts.google.com"
const GOOGLE_SUBJECT = "google-subject-123"
const CODE_VERIFIER = "a".repeat(64)

type GoogleOverrides = {
  readonly issuer?: string
  readonly audience?: string
  readonly nonce?: string
  readonly expiresAt?: number
  readonly subject?: string
}

export async function createHarness() {
  let now = 2_000_000_000
  const { publicKey, privateKey } = await generateKeyPair("RS256")
  const publicJwk = await exportJWK(publicKey)
  const keySet = createLocalJWKSet({ keys: [{ ...publicJwk, alg: "RS256", kid: "test-key" }] })
  const verifyGoogleToken = createGoogleVerifier(keySet, [GOOGLE_CLIENT_ID])
  const handler = createHandler({ now: () => now, verifyGoogleToken })

  async function issueGoogleToken(expectedNonce: string, overrides: GoogleOverrides = {}) {
    return new SignJWT({
      name: "Researcher",
      nonce: overrides.nonce ?? expectedNonce,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
      .setIssuer(overrides.issuer ?? GOOGLE_ISSUER)
      .setAudience(overrides.audience ?? GOOGLE_CLIENT_ID)
      .setSubject(overrides.subject ?? GOOGLE_SUBJECT)
      .setIssuedAt(now)
      .setExpirationTime(overrides.expiresAt ?? now + 300)
      .sign(privateKey)
  }

  async function challenge(): Promise<ChallengeResponse> {
    const response = await handler(
      post("/v1/auth/challenge", { codeChallenge: await pkceChallenge(CODE_VERIFIER) }),
      env,
    )
    return ChallengeResponseSchema.parse(await response.json())
  }

  async function exchange(
    challengeResponse: ChallengeResponse,
    overrides: GoogleOverrides = {},
  ): Promise<Response> {
    return handler(
      post("/v1/auth/exchange", {
        challengeId: challengeResponse.challengeId,
        codeVerifier: CODE_VERIFIER,
        idToken: await issueGoogleToken(challengeResponse.nonce, overrides),
      }),
      env,
    )
  }

  async function login(): Promise<SessionResponse> {
    const response = await exchange(await challenge())
    return SessionResponseSchema.parse(await response.json())
  }

  return {
    advance: (seconds: number) => {
      now += seconds
    },
    challenge,
    exchange,
    handler,
    issueGoogleToken,
    login,
    now: () => now,
  }
}

export function post(pathname: string, body: unknown, accessToken?: string): Request {
  const headers = new Headers({
    "CF-Connecting-IP": "203.0.113.10",
    "Content-Type": "application/json",
  })
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)
  return new Request(`https://account.test${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

export function get(pathname: string, accessToken?: string): Request {
  const headers = new Headers({ "CF-Connecting-IP": "203.0.113.10" })
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)
  return new Request(`https://account.test${pathname}`, { headers })
}

export async function resetDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM renewal_tokens"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM accounts"),
    env.DB.prepare("DELETE FROM login_challenges"),
    env.DB.prepare("DELETE FROM rate_limits"),
  ])
}
