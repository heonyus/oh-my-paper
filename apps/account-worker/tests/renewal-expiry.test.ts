import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"

import { ErrorResponseSchema, SessionResponseSchema } from "../src/contracts"
import { createHarness, post, resetDatabase } from "./harness"

beforeEach(resetDatabase)

describe("renewal lifetime", () => {
  it("keeps renewal expiry fixed across rotation", async () => {
    // Given
    const harness = await createHarness()
    const initial = await harness.login()
    harness.advance(60)

    // When
    const response = await harness.handler(
      post("/v1/auth/renew", { renewalToken: initial.renewalToken }),
      env,
    )

    // Then
    const rotated = SessionResponseSchema.parse(await response.json())
    expect(rotated.renewalExpiresAt).toBe(initial.renewalExpiresAt)
    expect(rotated.accessExpiresAt).toBe(harness.now() + 900)
    expect(rotated.offlineLeaseExpiresAt).toBe(harness.now() + 7 * 24 * 60 * 60)
  })

  it("rejects renewal after the thirty-day session lifetime", async () => {
    // Given
    const harness = await createHarness()
    const initial = await harness.login()
    harness.advance(30 * 24 * 60 * 60 + 1)

    // When
    const response = await harness.handler(
      post("/v1/auth/renew", { renewalToken: initial.renewalToken }),
      env,
    )

    // Then
    expect(response.status).toBe(401)
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe("invalid_renewal")
  })

  it("bounds the initial offline lease by renewal expiry", async () => {
    // Given
    const harness = await createHarness()

    // When
    const session = await harness.login()

    // Then
    expect(session.offlineLeaseExpiresAt).toBe(harness.now() + 7 * 24 * 60 * 60)
    expect(session.offlineLeaseExpiresAt).toBeLessThan(session.renewalExpiresAt)
  })
})
