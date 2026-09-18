import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"

import { AccountResponseSchema, ErrorResponseSchema, SessionResponseSchema } from "../src/contracts"
import { createHarness, get, post, resetDatabase } from "./harness"

beforeEach(resetDatabase)

describe("account session flow", () => {
  it("returns the verified account when access is valid", async () => {
    // Given
    const harness = await createHarness()
    const session = await harness.login()

    // When
    const response = await harness.handler(get("/v1/account", session.accessToken), env)

    // Then
    expect(response.status).toBe(200)
    expect(AccountResponseSchema.parse(await response.json()).account.displayName).toBe(
      "Researcher",
    )
  })

  it("prevents an offline lease from calling the account API", async () => {
    // Given
    const harness = await createHarness()
    const session = await harness.login()

    // When
    const response = await harness.handler(get("/v1/account", session.offlineLease), env)

    // Then
    expect(response.status).toBe(401)
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe("invalid_access")
  })

  it("consumes a challenge only once under concurrent exchange", async () => {
    // Given
    const harness = await createHarness()
    const challenge = await harness.challenge()

    // When
    const responses = await Promise.all([harness.exchange(challenge), harness.exchange(challenge)])

    // Then
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409])
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM sessions").first<{
      count: number
    }>()
    expect(row?.count).toBe(1)
  })

  it("revokes the current session on logout", async () => {
    // Given
    const harness = await createHarness()
    const session = await harness.login()

    // When
    const response = await harness.handler(
      post("/v1/logout", { renewalToken: session.renewalToken }),
      env,
    )

    // Then
    expect(response.status).toBe(204)
    const accountResponse = await harness.handler(get("/v1/account", session.accessToken), env)
    expect(accountResponse.status).toBe(401)
  })

  it("rotates renewal credentials and rejects confirmed reuse", async () => {
    // Given
    const harness = await createHarness()
    const initial = await harness.login()
    const firstRenewal = await harness.handler(
      post("/v1/auth/renew", { renewalToken: initial.renewalToken }),
      env,
    )
    const rotated = SessionResponseSchema.parse(await firstRenewal.json())

    // When
    const replay = await harness.handler(
      post("/v1/auth/renew", { renewalToken: initial.renewalToken }),
      env,
    )

    // Then
    expect(replay.status).toBe(401)
    expect(ErrorResponseSchema.parse(await replay.json()).error.code).toBe("renewal_reuse")
    const accountResponse = await harness.handler(get("/v1/account", rotated.accessToken), env)
    expect(accountResponse.status).toBe(401)
  })

  it("allows only one concurrent renewal and revokes the reused family", async () => {
    // Given
    const harness = await createHarness()
    const initial = await harness.login()

    // When
    const responses = await Promise.all([
      harness.handler(post("/v1/auth/renew", { renewalToken: initial.renewalToken }), env),
      harness.handler(post("/v1/auth/renew", { renewalToken: initial.renewalToken }), env),
    ])

    // Then
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401])
    const row = await env.DB.prepare(
      "SELECT revoke_reason AS revokeReason FROM sessions ORDER BY created_at DESC LIMIT 1",
    ).first<{ revokeReason: string | null }>()
    expect(row?.revokeReason).toBe("renewal_reuse")
  })

  it("stores renewal credentials only as hashes", async () => {
    // Given
    const harness = await createHarness()

    // When
    const session = await harness.login()

    // Then
    const row = await env.DB.prepare(
      "SELECT token_hash AS tokenHash FROM renewal_tokens ORDER BY created_at LIMIT 1",
    ).first<{ tokenHash: string }>()
    expect(row?.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(row?.tokenHash).not.toContain(session.renewalToken)
  })
})
