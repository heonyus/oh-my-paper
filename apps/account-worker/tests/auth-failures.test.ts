import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"

import { ErrorResponseSchema } from "../src/contracts"
import { createHarness, get, post, resetDatabase } from "./harness"

beforeEach(resetDatabase)

async function errorCode(response: Response): Promise<string> {
  return ErrorResponseSchema.parse(await response.json()).error.code
}

describe("identity and request rejection", () => {
  it.each([
    ["issuer", { issuer: "https://attacker.invalid" }],
    ["audience", { audience: "another-client" }],
    ["nonce", { nonce: "wrong-nonce" }],
  ])("rejects a wrong Google %s", async (_label, overrides) => {
    // Given
    const harness = await createHarness()
    const challenge = await harness.challenge()

    // When
    const response = await harness.exchange(challenge, overrides)

    // Then
    expect(response.status).toBe(401)
    expect(await errorCode(response)).toBe("invalid_identity")
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM accounts").first<{
      count: number
    }>()
    expect(row?.count).toBe(0)
  })

  it("rejects an expired Google token without consuming the challenge", async () => {
    // Given
    const harness = await createHarness()
    const challenge = await harness.challenge()

    // When
    const response = await harness.exchange(challenge, { expiresAt: harness.now() - 1 })

    // Then
    expect(response.status).toBe(401)
    const row = await env.DB.prepare(
      "SELECT consumed_at AS consumedAt FROM login_challenges WHERE id = ?1",
    )
      .bind(challenge.challengeId)
      .first<{ consumedAt: number | null }>()
    expect(row?.consumedAt).toBeNull()
  })

  it("rejects an expired challenge", async () => {
    // Given
    const harness = await createHarness()
    const challenge = await harness.challenge()
    harness.advance(601)

    // When
    const response = await harness.exchange(challenge)

    // Then
    expect(response.status).toBe(409)
    expect(await errorCode(response)).toBe("invalid_challenge")
  })

  it("rejects a PKCE verifier that does not match the challenge", async () => {
    // Given
    const harness = await createHarness()
    const challenge = await harness.challenge()
    const idToken = await harness.issueGoogleToken(challenge.nonce)

    // When
    const response = await harness.handler(
      post("/v1/auth/exchange", {
        challengeId: challenge.challengeId,
        codeVerifier: "b".repeat(64),
        idToken,
      }),
      env,
    )

    // Then
    expect(response.status).toBe(409)
    expect(await errorCode(response)).toBe("invalid_challenge")
  })

  it("rejects an oversized request before parsing JSON", async () => {
    // Given
    const harness = await createHarness()
    const request = post("/v1/auth/challenge", { codeChallenge: "x".repeat(17_000) })

    // When
    const response = await harness.handler(request, env)

    // Then
    expect(response.status).toBe(413)
    expect(await errorCode(response)).toBe("body_too_large")
  })

  it("rejects a missing protected credential", async () => {
    // Given
    const harness = await createHarness()

    // When
    const response = await harness.handler(get("/v1/account"), env)

    // Then
    expect(response.status).toBe(401)
    expect(await errorCode(response)).toBe("invalid_access")
  })

  it("rejects an expired access credential", async () => {
    // Given
    const harness = await createHarness()
    const session = await harness.login()
    harness.advance(901)

    // When
    const response = await harness.handler(get("/v1/account", session.accessToken), env)

    // Then
    expect(response.status).toBe(401)
    expect(await errorCode(response)).toBe("invalid_access")
  })

  it("rate limits repeated challenge requests", async () => {
    // Given
    const harness = await createHarness()
    const invalid = { codeChallenge: "invalid" }

    // When
    const responses = []
    for (let index = 0; index < 11; index += 1) {
      responses.push(await harness.handler(post("/v1/auth/challenge", invalid), env))
    }

    // Then
    expect(responses.at(-1)?.status).toBe(429)
    expect(await errorCode(responses.at(-1) ?? new Response())).toBe("rate_limited")
  })
})
